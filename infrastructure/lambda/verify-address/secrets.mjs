/**
 * secrets.mjs — Cached AWS Secrets Manager retrieval
 *
 * Secrets are fetched once per Lambda execution context and cached
 * in module-level scope to avoid redundant API calls on warm invocations.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-gov-west-1' });

/** @type {Map<string, object>} */
const cache = new Map();

/**
 * Retrieve and parse a JSON secret from Secrets Manager.
 * Cached for the lifetime of the Lambda execution context.
 *
 * @param {string} secretId - Secret ARN or name
 * @returns {Promise<object>}
 */
export async function getSecret(secretId) {
    if (cache.has(secretId)) return cache.get(secretId);

    const cmd  = new GetSecretValueCommand({ SecretId: secretId });
    const resp = await client.send(cmd);
    const value = JSON.parse(resp.SecretString);
    cache.set(secretId, value);
    return value;
}

/** Clear the in-process cache (useful in tests). */
export function clearCache() { cache.clear(); }
