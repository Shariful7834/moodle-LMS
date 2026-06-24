/**
 * Public issuer endpoints — dereferenceable per OB 3.0 / W3C VC Data Model 2.0.
 *
 *   GET /.well-known/jwks.json           → public JWK set (one key)
 *   GET /api/badges/issuer/did.json      → did:web DID document (issuer key)
 *   GET /api/badges/issuer               → OB 3.0 issuer Profile (JSON)
 *   GET /api/badges/credentials/:id      → Issued JWT-VC (default) or JSON-LD (Accept: application/vc+ld+json)
 *   GET /api/badges/achievements/:id     → Achievement definition
 *   GET /api/badges/status/:listId       → BitstringStatusListCredential signed as JWT-VC
 *
 * No authentication: these are public per spec so any verifier can resolve them.
 */

const express = require('express');
const db = require('../db');
const keys = require('../keys');
const statusList = require('../statusList');
const jwtVc = require('../jwtVc');

const router = express.Router();

// Public verifier endpoints. `cache` controls availability under load / brief
// outages: stable resources (DID doc, JWKS, issuer profile, achievement defs)
// are made cacheable so verifiers/CDNs keep a working copy and key resolution
// survives an origin restart or slowdown — the #1 cause of "issuer unreachable".
// Revocation-sensitive resources (credentials, status list) stay fresh.
const STABLE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
// Status list: revocation changes rarely. Cache it long with a long stale window so
// external verifiers / CDNs keep a working copy and don't hammer the origin on every
// check — the cause of intermittent "status server unreachable" on flaky hosts.
const FRESH_CACHE = 'public, max-age=300, stale-while-revalidate=86400';

function setCors(res, cache = 'no-cache') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cache);
}

// ── GET /api/badges/issuer/did.json ────────────────────────
router.get('/issuer/did.json', (req, res) => {
  setCors(res, STABLE_CACHE);
  res.json(keys.buildDidDocument());
});

// ── GET /api/badges/issuer ─────────────────────────────────
router.get('/issuer', (req, res) => {
  const s = keys.getState();
  setCors(res, STABLE_CACHE);
  res.json({
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
    ],
    id: s.issuerDid,
    type: ['Profile'],
    name: 'Academic Achievement Wallet',
    description: 'OB 3.0 credential issuer for verified academic achievements.',
    url: s.issuerBaseUrl,
    publicKey: keys.buildDidDocument().verificationMethod
  });
});

// ── GET /api/badges/credentials/:id ────────────────────────
// Default: signed JWT-VC. Returns JSON-LD when Accept asks for it.
router.get('/credentials/:id', (req, res) => {
  const cred = db.credentials.findById(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Credential not found' });
  if (cred.status === 'revoked') {
    res.setHeader('X-Credential-Status', 'revoked');
  }

  setCors(res);

  const accept = (req.headers.accept || '').toLowerCase();
  const acceptsJwt = accept.includes('application/vc+jwt') || accept.includes('application/jwt');
  const acceptsJsonLd = accept.includes('application/vc+ld+json') || accept.includes('application/ld+json') || accept.includes('application/json');
  // Prefer JWT (signed) by default. Only return JSON-LD when client explicitly asks for JSON-LD AND not JWT.
  const wantsJsonLd = (acceptsJsonLd && !acceptsJwt) || req.query.format === 'json';
  const wantsJwt = !wantsJsonLd || req.query.format === 'jwt';

  if (wantsJwt && cred.jwt) {
    res.setHeader('Content-Type', 'application/vc+jwt');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="credential-${cred.id}.jwt"`);
    }
    return res.send(cred.jwt);
  }

  let vc = cred.vc;
  if (!vc && cred.ob3Json) {
    try { vc = JSON.parse(cred.ob3Json); } catch { vc = null; }
  }
  if (!vc) return res.status(404).json({ error: 'Credential payload missing' });
  res.setHeader('Content-Type', 'application/vc+ld+json');
  res.json(vc);
});

// ── GET /api/badges/achievements/:id ───────────────────────
router.get('/achievements/:id', (req, res) => {
  const targetId = req.params.id;
  const all = db.credentials.getAll();
  let achievement = null;
  for (const c of all) {
    let vc = c.vc;
    if (!vc && c.ob3Json) { try { vc = JSON.parse(c.ob3Json); } catch {} }
    const ach = vc?.credentialSubject?.achievement;
    if (!ach) continue;
    if (ach.id === targetId || ach.id?.endsWith(`/${targetId}`)) {
      achievement = ach;
      break;
    }
  }
  if (!achievement) return res.status(404).json({ error: 'Achievement not found' });
  setCors(res, STABLE_CACHE);
  res.json(achievement);
});

// ── GET /api/badges/status/:listId ─────────────────────────
// Returns the StatusListCredential. Defaults to JSON-LD (with a readable
// encodedList) for maximum verifier interoperability — a generic fetcher
// (Accept: */* or none) must be able to read the revocation bitstring.
// The SIGNED JWT-VC form is returned only when the client explicitly accepts
// it (Accept: application/vc+jwt) or asks via ?format=jwt.
router.get('/status/:listId', async (req, res) => {
  setCors(res, FRESH_CACHE);
  const s = keys.getState();
  const listId = req.params.listId;

  const accept = (req.headers.accept || '').toLowerCase();
  const acceptsJwt = accept.includes('application/vc+jwt') || accept.includes('application/jwt');
  const wantsJwt = acceptsJwt || req.query.format === 'jwt';
  const wantsJsonLd = !wantsJwt;

  // Allow legacy StatusList2021 form via ?spec=2021
  const spec = req.query.spec === '2021' ? 'statuslist2021' : 'bitstring';
  const credential = statusList.buildStatusListCredential(s.issuerDid, s.issuerBaseUrl, listId, spec);

  if (wantsJsonLd) {
    res.setHeader('Content-Type', 'application/vc+ld+json');
    return res.json(credential);
  }

  try {
    const jwt = await jwtVc.signVerifiableCredential(credential);
    res.setHeader('Content-Type', 'application/vc+jwt');
    return res.send(jwt);
  } catch (err) {
    console.error('Status list signing failed:', err);
    return res.status(500).json({ error: 'Failed to sign status list', detail: err.message });
  }
});

// ── GET /.well-known/jwks.json (mounted by parent at root) ──
router.get('/jwks', (req, res) => {
  setCors(res, STABLE_CACHE);
  const { publicJwk } = keys.getState();
  const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, alg: 'ES256', use: 'sig', kid: keys.getState().verificationMethodId };
  res.json({ keys: [pub] });
});

module.exports = router;
