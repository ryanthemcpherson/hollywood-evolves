import { createLocalJWKSet, jwtVerify } from 'jose';

const DISCOVERY_URL = 'https://www.linkedin.com/oauth/.well-known/openid-configuration';
const EXPECTED_ISSUER = 'https://www.linkedin.com';

function httpError(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

async function responseJson(response, context) {
  if (!response?.ok) throw httpError(`${context} failed`);
  try { return await response.json(); } catch { throw httpError(`${context} returned invalid JSON`); }
}

export class LinkedInOidcClient {
  constructor({ clientId, clientSecret, redirectUri, fetch = globalThis.fetch }) {
    if (!clientId || !clientSecret || !redirectUri || typeof fetch !== 'function') throw new Error('LinkedIn OIDC configuration is incomplete');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.fetch = fetch;
    this.metadata = null;
  }

  async discover() {
    if (this.metadata) return this.metadata;
    const metadata = await responseJson(await this.fetch(DISCOVERY_URL, { headers: { accept: 'application/json' } }), 'LinkedIn discovery');
    if (metadata.issuer !== EXPECTED_ISSUER) throw httpError('LinkedIn discovery returned an unexpected issuer');
    for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (typeof metadata[field] !== 'string' || !metadata[field].startsWith('https://')) throw httpError(`LinkedIn discovery is missing ${field}`);
    }
    this.metadata = metadata;
    return metadata;
  }

  async authorizationUrl({ state, nonce }) {
    if (!state || !nonce) throw new Error('State and nonce are required');
    const metadata = await this.discover();
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
    }).toString();
    return url;
  }

  async redeem({ code, nonce }) {
    if (!code || !nonce) throw httpError('Authorization code and nonce are required', 400);
    const metadata = await this.discover();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });
    const token = await responseJson(await this.fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    }), 'LinkedIn token exchange');
    if (typeof token.id_token !== 'string') throw httpError('LinkedIn token response did not include an ID token');
    const jwks = await responseJson(await this.fetch(metadata.jwks_uri, { headers: { accept: 'application/json' } }), 'LinkedIn signing keys');
    const { payload } = await jwtVerify(token.id_token, createLocalJWKSet(jwks), {
      issuer: EXPECTED_ISSUER,
      audience: this.clientId,
      algorithms: ['RS256'],
      maxTokenAge: '10m',
      clockTolerance: 5,
    });
    if (payload.nonce !== nonce) throw httpError('LinkedIn ID token nonce did not match', 401);
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.name !== 'string' || !payload.name.trim()) {
      throw httpError('LinkedIn ID token is missing required member claims', 401);
    }
    return {
      sub: payload.sub,
      name: payload.name.trim(),
      picture: typeof payload.picture === 'string' ? payload.picture : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
    };
  }
}
