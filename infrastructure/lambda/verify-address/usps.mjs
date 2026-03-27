/**
 * usps.mjs — USPS Address Validation API client (OAuth2, v3)
 *
 * Endpoints used:
 *   POST https://apis.usps.com/oauth2/v3/token         — client_credentials token
 *   GET  https://apis.usps.com/addresses/v3/address    — CASS/DPV address lookup
 *
 * Tokens are cached in module scope (expire ~3600s; refreshed with 60s buffer).
 */

import { getSecret } from './secrets.mjs';

const USPS_BASE      = process.env.USPS_API_BASE_URL || 'https://apis.usps.com';
const TOKEN_ENDPOINT = `${USPS_BASE}/oauth2/v3/token`;
const ADDR_ENDPOINT  = `${USPS_BASE}/addresses/v3/address`;

/** @type {{ token: string, expiresAt: number } | null} */
let tokenCache = null;

/**
 * Obtain (or reuse) a USPS OAuth2 access token.
 * @returns {Promise<string>} Bearer token
 */
async function getToken() {
    const now = Date.now();
    if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

    const secretId = process.env.USPS_SECRET_ARN;
    const creds    = await getSecret(secretId);

    const body = new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     creds.consumer_key,
        client_secret: creds.consumer_secret
    });

    const resp = await fetch(TOKEN_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString()
    });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(`USPS token error ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    tokenCache = {
        token:     data.access_token,
        expiresAt: now + (data.expires_in || 3600) * 1000
    };
    return tokenCache.token;
}

/**
 * Verify an address via the USPS v3 Address API.
 *
 * @param {{ street: string, city: string, state: string, zip: string }} addr
 * @returns {Promise<object>} Normalized USPS response
 */
export async function verifyAddress(addr) {
    const token = await getToken();

    const params = new URLSearchParams({
        streetAddress: addr.street || '',
        city:          addr.city   || '',
        state:         addr.state  || '',
        ZIPCode:       (addr.zip   || '').replace(/\D/g, '').slice(0, 5)
    });

    const resp = await fetch(`${ADDR_ENDPOINT}?${params}`, {
        method:  'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => resp.statusText);
        throw new Error(`USPS API error ${resp.status}: ${txt}`);
    }

    const data = await resp.json();
    return normalizeUspsResponse(data, addr);
}

/**
 * Map the USPS v3 response to the platform's canonical result shape.
 */
function normalizeUspsResponse(data, input) {
    const a = data.address || data;

    const dpvMatch = a.DPVConfirmation || a.dpvMatchCode || 'N';
    const vacant   = a.Business === 'N' && a.Vacant === 'Y' ? 'Y' : (a.dpvVacancy || 'N');

    const zip5 = (a.ZIPCode || a.zip5 || '').replace(/\D/g,'').slice(0,5);
    const zip4 = (a.ZIPPlus4 || a.zip4 || '').replace(/\D/g,'').slice(0,4);

    const confidence =
        dpvMatch === 'Y' ? 99 :
        dpvMatch === 'S' ? 85 :
        dpvMatch === 'D' ? 75 : 30;

    return {
        status:        confidence >= 80 ? 'verified' : confidence >= 60 ? 'corrected' : 'invalid',
        confidence,
        input,
        standardized: {
            street: a.streetAddress || a.DeliveryAddress || input.street,
            city:   a.city          || a.City            || input.city,
            state:  a.state         || a.State           || input.state,
            zip:    zip5,
            zip4
        },
        deliverable:   dpvMatch === 'Y' || dpvMatch === 'S',
        dpvMatchCode:  dpvMatch,
        dpvVacancy:    vacant,
        carrierRoute:  a.carrierRoute  || a.CarrierRoute  || '',
        deliveryPoint: a.deliveryPoint || a.DeliveryPoint || '',
        fromCache:     false,
        cacheAge:      null,
        source:        'usps',
        notes:         buildNotes(a, dpvMatch, vacant)
    };
}

function buildNotes(a, dpvMatch, vacant) {
    const notes = [];
    if (dpvMatch === 'S') notes.push('Secondary unit (apt/suite) could not be confirmed.');
    if (dpvMatch === 'D') notes.push('Street matched but unit number is missing.');
    if (dpvMatch === 'N') notes.push('Address did not match USPS records.');
    if (vacant === 'Y')   notes.push('Address is currently vacant.');
    if (a.returnText)     notes.push(a.returnText);
    return notes;
}
