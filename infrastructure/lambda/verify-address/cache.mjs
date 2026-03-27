/**
 * cache.mjs — Redis (ElastiCache) client via ioredis
 *
 * Responsibilities:
 *   • Cache verified address results (TTL 24 h)
 *   • Rate-limiting per IP (sliding window, 60 req/min)
 *   • Connection reuse across warm Lambda invocations
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';
import { getSecret } from './secrets.mjs';

const CACHE_TTL_SECONDS    = 86_400;  // 24 h
const RATE_LIMIT_WINDOW    = 60;      // 1 minute window
const RATE_LIMIT_MAX_CALLS = 60;      // 60 requests per window per IP

/** @type {Redis | null} */
let redisClient = null;

/**
 * Get (or create) a singleton Redis connection.
 * @returns {Promise<Redis>}
 */
export async function getClient() {
    if (redisClient && redisClient.status === 'ready') return redisClient;

    const host = process.env.REDIS_HOST;
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    let password;
    const secretArn = process.env.REDIS_SECRET_ARN;
    if (secretArn) {
        const s = await getSecret(secretArn);
        password = s.auth_token;
    }

    redisClient = new Redis({
        host,
        port,
        password,
        tls:             { rejectUnauthorized: true },
        connectTimeout:  3_000,
        commandTimeout:  2_000,
        maxRetriesPerRequest: 2,
        lazyConnect:     true,
        enableReadyCheck: true
    });

    redisClient.on('error', err => console.error('[Redis] error:', err.message));

    await redisClient.connect();
    return redisClient;
}

/**
 * Compute a deterministic cache key from a normalized address object.
 * @param {{ street: string, city: string, state: string, zip: string }} addr
 * @returns {string}  "avt:{hash}"
 */
export function cacheKey(addr) {
    const normalized =
        `${(addr.street || '').toUpperCase().trim()}|` +
        `${(addr.city   || '').toUpperCase().trim()}|` +
        `${(addr.state  || '').toUpperCase().trim()}|` +
        `${(addr.zip    || '').replace(/\D/g,'').slice(0,5)}`;
    return `avt:${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
}

/**
 * Look up an address result in Redis.
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export async function get(key) {
    try {
        const redis = await getClient();
        const raw   = await redis.get(key);
        if (!raw) return null;
        const result = JSON.parse(raw);
        // Calculate age from stored timestamp
        const age = result._cachedAt ? Math.floor((Date.now() - result._cachedAt) / 1000) : null;
        return { ...result, fromCache: true, cacheAge: age };
    } catch (err) {
        console.warn('[Redis] get failed:', err.message);
        return null;
    }
}

/**
 * Store an address result in Redis with TTL.
 * @param {string} key
 * @param {object} result
 */
export async function set(key, result) {
    try {
        const redis   = await getClient();
        const payload = JSON.stringify({ ...result, _cachedAt: Date.now() });
        await redis.setex(key, CACHE_TTL_SECONDS, payload);
    } catch (err) {
        console.warn('[Redis] set failed:', err.message);
    }
}

/**
 * Sliding-window rate limiter.
 * @param {string} ip  - Client IP address
 * @returns {Promise<{ allowed: boolean, remaining: number, resetIn: number }>}
 */
export async function checkRateLimit(ip) {
    try {
        const redis = await getClient();
        const key   = `rl:${ip}`;
        const now   = Date.now();
        const window = now - RATE_LIMIT_WINDOW * 1000;

        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(key, '-inf', window);
        pipeline.zadd(key, now, `${now}`);
        pipeline.zcard(key);
        pipeline.expire(key, RATE_LIMIT_WINDOW * 2);
        const results = await pipeline.exec();

        const count = results[2][1];
        return {
            allowed:   count <= RATE_LIMIT_MAX_CALLS,
            remaining: Math.max(0, RATE_LIMIT_MAX_CALLS - count),
            resetIn:   RATE_LIMIT_WINDOW
        };
    } catch (err) {
        console.warn('[Redis] rate limit check failed, allowing:', err.message);
        return { allowed: true, remaining: RATE_LIMIT_MAX_CALLS, resetIn: RATE_LIMIT_WINDOW };
    }
}

/**
 * Retrieve cached stats summary (written by nightly batch job).
 * @returns {Promise<object|null>}
 */
export async function getStatsCache() {
    try {
        const redis = await getClient();
        const raw   = await redis.get('avt:stats');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

/**
 * Ping Redis and return latency.
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
export async function healthCheck() {
    const t0 = Date.now();
    try {
        const redis = await getClient();
        await redis.ping();
        return { status: 'up', latencyMs: Date.now() - t0 };
    } catch (err) {
        return { status: 'down', error: err.message };
    }
}
