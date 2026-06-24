/**
 * JWT-VC issuance + verification per OB 3.0 / W3C VC Data Model 2.0.
 *
 * - signCredential(vc) → JWS compact (header.payload.signature)
 *     header.alg = ES256, header.typ = JWT, header.kid = did:web:.../#issuer-key-1
 *     payload = { iss, sub, jti, iat, nbf, vc }
 *
 * - verifyJwtCredential(jwt) → { verified, payload, vc, header, errors[] }
 *     Resolves issuer did:web → fetches DID document → uses publicKeyJwk → verifies ES256.
 *
 * - buildAchievementCredential(...) → fully-formed OB 3.0 vc payload (matches certlister
 *     reference shape: HTTPS ids, mailto subject, hashed identifier, statusList entry).
 */

const crypto = require('crypto');
const { SignJWT, jwtVerify, importJWK, decodeProtectedHeader, decodeJwt } = require('jose');
const keys = require('./keys');
const statusList = require('./statusList');
const { safeFetch } = require('./safeFetch');

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function sha256IdentityHash(salt, value) {
  const h = crypto.createHash('sha256').update(`${salt}${value}`.toLowerCase()).digest('hex');
  return `sha256$${h}`;
}

function isoDate(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build an OB 3.0 AchievementCredential payload.
 *
 * Result is the inner `vc` object embedded inside the JWT-VC.
 */
function buildAchievementCredential({
  credentialId,
  achievementId,
  achievementName,
  achievementDescription,
  achievementType = 'Achievement',
  criteriaNarrative,
  imageUrl,
  imageCaption,
  studentEmail,
  studentName,
  issuerName,
  issuerDescription,
  issuerUrl,
  issuerEmail,
  validFromIso,
  validUntilIso,
  statusListId,
  statusListIndex,
  statusListType = 'BitstringStatusListEntry',
  identitySalt,
  evidence,
  alignment,
  tag
}) {
  const s = keys.getState();
  const baseUrl = s.issuerBaseUrl;

  const credentialUrl = `${baseUrl}/api/badges/credentials/${credentialId}`;
  const achievementUrl = achievementId
    ? `${baseUrl}/api/badges/achievements/${achievementId}`
    : `${baseUrl}/api/badges/achievements/${credentialId}`;

  const salt = identitySalt || generateSalt();

  const vc = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
    ],
    id: credentialUrl,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: achievementName,
    description: achievementDescription || `Open Badges 3.0 credential: ${achievementName}`,
    issuer: {
      id: s.issuerDid,
      type: ['Profile'],
      name: issuerName || 'Academic Achievement Wallet',
      ...(issuerDescription ? { description: issuerDescription } : {}),
      ...(issuerUrl ? { url: issuerUrl } : { url: baseUrl }),
      ...(issuerEmail ? { email: issuerEmail } : {})
    },
    validFrom: validFromIso || isoDate(),
    ...(validUntilIso ? { validUntil: validUntilIso } : {}),
    credentialSubject: {
      id: `mailto:${studentEmail}`,
      type: ['AchievementSubject'],
      achievement: {
        id: achievementUrl,
        type: ['Achievement'],
        ...(achievementType ? { achievementType } : {}),
        name: achievementName,
        description: achievementDescription || `Achievement: ${achievementName}`,
        criteria: {
          narrative: criteriaNarrative || `Awarded for completion of ${achievementName}.`
        },
        ...(imageUrl ? {
          image: {
            id: imageUrl,
            type: 'Image',
            ...(imageCaption ? { caption: imageCaption } : {})
          }
        } : {}),
        // Framework alignment (the key the LMS matches on for Pre-check) + free-text tags.
        ...(Array.isArray(alignment) && alignment.length > 0 ? { alignment } : {}),
        ...(Array.isArray(tag) && tag.length > 0 ? { tag } : {})
      },
      identifier: [{
        type: 'IdentityObject',
        identityType: 'emailAddress',
        hashed: true,
        salt,
        identityHash: sha256IdentityHash(salt, studentEmail)
      }]
    },
    credentialSchema: [{
      id: 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json',
      type: '1EdTechJsonSchemaValidator2019'
    }]
  };

  if (statusListId !== undefined && statusListIndex !== undefined) {
    vc.credentialStatus = statusList.buildCredentialStatusEntry(baseUrl, statusListId, statusListIndex, statusListType);
  }

  if (Array.isArray(evidence) && evidence.length > 0) {
    vc.evidence = evidence;
  }

  if (studentName) {
    vc.credentialSubject.name = studentName;
  }

  return vc;
}

/**
 * Sign a VC payload as a JWT-VC (compact JWS).
 * Returns { jwt, header, payload }.
 */
async function signCredential(vc, { studentEmail } = {}) {
  const s = keys.getState();
  const now = Math.floor(Date.now() / 1000);
  const nbf = vc.validFrom ? Math.floor(new Date(vc.validFrom).getTime() / 1000) : now;
  const exp = vc.validUntil ? Math.floor(new Date(vc.validUntil).getTime() / 1000) : undefined;

  const subject = vc.credentialSubject?.id || (studentEmail ? `mailto:${studentEmail}` : undefined);

  const builder = new SignJWT({ vc })
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+jwt', kid: s.verificationMethodId, cty: 'vc' })
    .setIssuer(s.issuerDid)
    .setIssuedAt(now)
    .setNotBefore(nbf)
    .setJti(vc.id);

  if (subject) builder.setSubject(subject);
  if (exp) builder.setExpirationTime(exp);

  const jwt = await builder.sign(s.privateKey);
  const header = decodeProtectedHeader(jwt);
  const payload = decodeJwt(jwt);
  return { jwt, header, payload };
}

/**
 * Sign an arbitrary VerifiableCredential JSON-LD payload as JWT-VC.
 * Used for StatusListCredential, EndorsementCredential, etc.
 */
async function signVerifiableCredential(vc) {
  const s = keys.getState();
  const now = Math.floor(Date.now() / 1000);
  const nbf = vc.validFrom ? Math.floor(new Date(vc.validFrom).getTime() / 1000) : now;
  const exp = vc.validUntil ? Math.floor(new Date(vc.validUntil).getTime() / 1000) : undefined;

  const builder = new SignJWT({ vc })
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+jwt', kid: s.verificationMethodId, cty: 'vc' })
    .setIssuer(s.issuerDid)
    .setIssuedAt(now)
    .setNotBefore(nbf)
    .setJti(vc.id);
  if (exp) builder.setExpirationTime(exp);
  return await builder.sign(s.privateKey);
}

/**
 * Resolve a did:web identifier into the DID document URL.
 *   did:web:example.com               → https://example.com/.well-known/did.json
 *   did:web:example.com:path:to       → https://example.com/path/to/did.json
 *   did:web:host%3Aport:path:to       → http://host:port/path/to/did.json (port-decoded)
 */
function didWebToUrl(did) {
  if (!did.startsWith('did:web:')) return null;
  const rest = did.slice('did:web:'.length);
  const parts = rest.split(':').map(p => decodeURIComponent(p));
  const hostPart = parts[0];
  const subPath = parts.slice(1);
  // Localhost dev convenience: explicit port via %3A is treated as http://
  const isLocal = hostPart.startsWith('localhost') || hostPart.startsWith('127.0.0.1');
  const scheme = isLocal ? 'http' : 'https';
  const base = `${scheme}://${hostPart}`;
  const url = subPath.length === 0
    ? `${base}/.well-known/did.json`
    : `${base}/${subPath.join('/')}/did.json`;
  return url;
}

async function fetchDidDocument(did) {
  // Local short-circuit: own issuer DID
  try {
    const localState = keys.getState();
    if (localState.issuerDid === did) {
      return keys.buildDidDocument();
    }
  } catch (_e) {
    // keys not yet init — fall through to network
  }
  const url = didWebToUrl(did);
  if (!url) throw new Error(`Unsupported DID method: ${did}`);
  const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`DID document fetch failed: HTTP ${res.status} for ${url}`);
  return await res.json();
}

function findVerificationMethod(didDoc, kid) {
  if (!didDoc?.verificationMethod) return null;
  // Strict: only return a VM whose id matches kid (full or fragment-relative).
  const direct = didDoc.verificationMethod.find(vm => vm.id === kid);
  if (direct) return direct;
  if (kid && kid.startsWith('#')) {
    return didDoc.verificationMethod.find(vm => vm.id?.endsWith(kid)) || null;
  }
  return null;
}

function isAssertionMethod(didDoc, vmId) {
  if (!Array.isArray(didDoc?.assertionMethod)) return false;
  return didDoc.assertionMethod.some(ref => ref === vmId || (ref && ref.id === vmId));
}

/**
 * Verify a JWT-VC. Returns { verified, errors, header, payload, vc, issuerDid, didDocument }.
 */
async function verifyJwtCredential(jwt) {
  const errors = [];
  let header, payload;
  try {
    header = decodeProtectedHeader(jwt);
    payload = decodeJwt(jwt);
  } catch (e) {
    return { verified: false, errors: [`Malformed JWT: ${e.message}`] };
  }

  const issuerDid = payload.iss;
  if (!issuerDid) errors.push('Missing iss claim');
  if (!header.kid) errors.push('Missing kid header');
  if (header.alg !== 'ES256') errors.push(`Unexpected alg: ${header.alg} (expected ES256)`);
  if (header.typ && header.typ !== 'vc+jwt' && header.typ !== 'JWT') {
    errors.push(`Unexpected typ: ${header.typ} (expected vc+jwt)`);
  }

  // I2: kid controller MUST match iss
  if (issuerDid && header.kid) {
    const kidController = header.kid.includes('#') ? header.kid.split('#')[0] : header.kid;
    if (kidController !== issuerDid) {
      errors.push(`kid controller (${kidController}) does not match iss (${issuerDid})`);
    }
  }

  // I3: nbf enforcement — JWT not yet valid
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 5) {
    errors.push(`Credential not yet valid (nbf=${new Date(payload.nbf * 1000).toISOString()})`);
  }
  if (typeof payload.exp === 'number' && payload.exp <= nowSec) {
    errors.push(`Credential expired (exp=${new Date(payload.exp * 1000).toISOString()})`);
  }

  let didDocument = null;
  let publicKeyJwk = null;
  let vmAssertionOk = false;
  try {
    didDocument = await fetchDidDocument(issuerDid);
    const vm = findVerificationMethod(didDocument, header.kid);
    if (!vm) errors.push(`No verificationMethod matched kid ${header.kid}`);
    else if (!vm.publicKeyJwk) errors.push('verificationMethod missing publicKeyJwk');
    else {
      publicKeyJwk = vm.publicKeyJwk;
      // Verify VM's controller matches issuer DID
      if (vm.controller && vm.controller !== issuerDid) {
        errors.push(`verificationMethod.controller (${vm.controller}) does not match iss (${issuerDid})`);
      }
      // Verify VM is in assertionMethod array
      vmAssertionOk = isAssertionMethod(didDocument, vm.id) || isAssertionMethod(didDocument, header.kid);
      if (!vmAssertionOk) errors.push(`verificationMethod ${vm.id} is not authorized for assertionMethod`);
    }
  } catch (e) {
    errors.push(`DID resolution failed: ${e.message}`);
  }

  let verified = false;
  if (publicKeyJwk && errors.length === 0) {
    try {
      const key = await importJWK(publicKeyJwk, 'ES256');
      await jwtVerify(jwt, key, {
        algorithms: ['ES256'],
        issuer: issuerDid,
        clockTolerance: 5
      });
      verified = true;
    } catch (e) {
      errors.push(`Signature verification failed: ${e.message}`);
    }
  } else if (publicKeyJwk) {
    // Still attempt cryptographic verify even with non-fatal errors so UI shows actual sig status
    try {
      const key = await importJWK(publicKeyJwk, 'ES256');
      await jwtVerify(jwt, key, { algorithms: ['ES256'], clockTolerance: 5 });
      verified = false; // crypto OK but other constraints failed
    } catch (e) {
      errors.push(`Signature verification failed: ${e.message}`);
    }
  }

  const vc = payload.vc || null;
  return { verified, errors, header, payload, vc, issuerDid, didDocument, vmAssertionOk };
}

module.exports = {
  buildAchievementCredential,
  signCredential,
  signVerifiableCredential,
  verifyJwtCredential,
  didWebToUrl,
  fetchDidDocument,
  sha256IdentityHash,
  generateSalt
};
