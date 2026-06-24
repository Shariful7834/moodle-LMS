/**
 * Issuer key management — ES256 (P-256) keypair for signing OB 3.0 JWT-VC credentials.
 *
 * On first run generates a fresh ES256 keypair and persists JWKs under data/keys/.
 * Subsequent runs load the saved keys. Public JWK is also embedded into the issuer
 * did:web DID document served at /api/badges/issuer/did.json.
 */

const fs = require('fs');
const path = require('path');
const { generateKeyPair, exportJWK, importJWK, calculateJwkThumbprint } = require('jose');

const KEYS_DIR = path.join(__dirname, '..', 'data', 'keys');
const PRIVATE_FILE = path.join(KEYS_DIR, 'issuer.private.jwk.json');
const PUBLIC_FILE = path.join(KEYS_DIR, 'issuer.public.jwk.json');

const ISSUER_BASE_URL = (process.env.ISSUER_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const ISSUER_DID = process.env.ISSUER_DID || deriveDidWebFromBaseUrl(ISSUER_BASE_URL);
const VERIFICATION_METHOD_ID = `${ISSUER_DID}#issuer-key-1`;

function deriveDidWebFromBaseUrl(url) {
  // did:web rules: host[:port] mapped to did:web:host%3Aport, path segments joined by ':'
  const u = new URL(url);
  const host = u.port ? `${u.hostname}%3A${u.port}` : u.hostname;
  const pathSegments = ['api', 'badges', 'issuer'];
  return `did:web:${host}:${pathSegments.join(':')}`;
}

function ensureDir() {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
}

let _state = null;

async function init() {
  if (_state) return _state;
  ensureDir();

  let privateJwk, publicJwk;

  if (fs.existsSync(PRIVATE_FILE) && fs.existsSync(PUBLIC_FILE)) {
    privateJwk = JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf-8'));
    publicJwk = JSON.parse(fs.readFileSync(PUBLIC_FILE, 'utf-8'));
  } else {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
    privateJwk = await exportJWK(privateKey);
    publicJwk = await exportJWK(publicKey);
    privateJwk.alg = 'ES256';
    privateJwk.use = 'sig';
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    fs.writeFileSync(PRIVATE_FILE, JSON.stringify(privateJwk, null, 2));
    fs.writeFileSync(PUBLIC_FILE, JSON.stringify(publicJwk, null, 2));
    console.log('[KEYS] Generated new ES256 issuer keypair at', KEYS_DIR);
  }

  const privateKey = await importJWK(privateJwk, 'ES256');
  const publicKey = await importJWK(publicJwk, 'ES256');
  const thumbprint = await calculateJwkThumbprint(publicJwk);

  _state = {
    privateKey,
    publicKey,
    privateJwk,
    publicJwk,
    thumbprint,
    issuerDid: ISSUER_DID,
    issuerBaseUrl: ISSUER_BASE_URL,
    verificationMethodId: VERIFICATION_METHOD_ID
  };
  return _state;
}

function getState() {
  if (!_state) throw new Error('keys.init() must be awaited before use');
  return _state;
}

function buildDidDocument() {
  const s = getState();
  const publicJwk = { kty: s.publicJwk.kty, crv: s.publicJwk.crv, x: s.publicJwk.x, y: s.publicJwk.y };
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: s.issuerDid,
    verificationMethod: [{
      id: s.verificationMethodId,
      type: 'JsonWebKey2020',
      controller: s.issuerDid,
      publicKeyJwk: publicJwk
    }],
    assertionMethod: [s.verificationMethodId],
    authentication: [s.verificationMethodId]
  };
}

module.exports = {
  init,
  getState,
  buildDidDocument,
  ISSUER_BASE_URL,
  ISSUER_DID,
  VERIFICATION_METHOD_ID
};
