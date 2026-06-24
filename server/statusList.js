/**
 * Status list — supports BOTH:
 *   - BitstringStatusList (W3C VCDM 2.0 — preferred)
 *   - StatusList2021    (legacy VCDM 1.1 / earlier OB 3.0 examples)
 *
 * Persistence: data/status/<listId>.bin (raw bytes) + index counter in db._meta.
 * The list itself is exposed as a SIGNED VerifiableCredential (JWT-VC).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('./db');

const STATUS_DIR = path.join(__dirname, '..', 'data', 'status');
const DEFAULT_LIST_ID = 'list-1';
const LIST_BITS = 131072; // 16 KB bitstring (per W3C BitstringStatusList min recommendation)

function ensureDir() {
  if (!fs.existsSync(STATUS_DIR)) fs.mkdirSync(STATUS_DIR, { recursive: true });
}

function listFile(listId) {
  return path.join(STATUS_DIR, `${listId}.bin`);
}

function loadBuffer(listId = DEFAULT_LIST_ID) {
  ensureDir();
  const file = listFile(listId);
  if (!fs.existsSync(file)) {
    const buf = Buffer.alloc(LIST_BITS / 8, 0);
    fs.writeFileSync(file, buf);
    return buf;
  }
  return fs.readFileSync(file);
}

function saveBuffer(buf, listId = DEFAULT_LIST_ID) {
  ensureDir();
  fs.writeFileSync(listFile(listId), buf);
}

function nextIndex(listId = DEFAULT_LIST_ID) {
  const data = db.load();
  if (!data._meta) data._meta = {};
  if (!data._meta.statusIndex) data._meta.statusIndex = {};
  if (data._meta.statusIndex[listId] === undefined) data._meta.statusIndex[listId] = 0;
  const idx = data._meta.statusIndex[listId];
  data._meta.statusIndex[listId] = idx + 1;
  db.save();
  if (idx >= LIST_BITS) throw new Error('StatusList full');
  return idx;
}

function setRevoked(listId, index, revoked) {
  const buf = loadBuffer(listId);
  const byteIdx = Math.floor(index / 8);
  const bitIdx = index % 8;
  if (revoked) buf[byteIdx] |= (1 << bitIdx);
  else buf[byteIdx] &= ~(1 << bitIdx);
  saveBuffer(buf, listId);
}

function isRevoked(listId, index) {
  const buf = loadBuffer(listId);
  const byteIdx = Math.floor(index / 8);
  const bitIdx = index % 8;
  return (buf[byteIdx] & (1 << bitIdx)) !== 0;
}

/**
 * Build a BitstringStatusListCredential (W3C VCDM 2.0 — preferred).
 * Signed by caller via signVerifiableCredential.
 */
function buildBitstringStatusListCredential(issuerDid, baseUrl, listId = DEFAULT_LIST_ID) {
  const buf = loadBuffer(listId);
  const gz = zlib.gzipSync(buf);
  const encoded = `u${gz.toString('base64url')}`; // multibase 'u' = base64url-no-pad
  const issuanceDate = new Date().toISOString();
  const url = `${baseUrl}/api/badges/status/${listId}`;
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2'
    ],
    id: url,
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    issuer: issuerDid,
    validFrom: issuanceDate,
    credentialSubject: {
      id: `${url}#list`,
      type: 'BitstringStatusList',
      statusPurpose: 'revocation',
      encodedList: encoded
    }
  };
}

/**
 * Build a StatusList2021Credential (legacy — kept for compatibility).
 */
function buildStatusList2021Credential(issuerDid, baseUrl, listId = DEFAULT_LIST_ID) {
  const buf = loadBuffer(listId);
  const gz = zlib.gzipSync(buf);
  const encoded = gz.toString('base64');
  const issuanceDate = new Date().toISOString();
  const url = `${baseUrl}/api/badges/status/${listId}`;
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/vc/status-list/2021/v1'
    ],
    id: url,
    type: ['VerifiableCredential', 'StatusList2021Credential'],
    issuer: issuerDid,
    validFrom: issuanceDate,
    credentialSubject: {
      id: `${url}#list`,
      type: 'StatusList2021',
      statusPurpose: 'revocation',
      encodedList: encoded
    }
  };
}

/**
 * Backwards-compatible alias used by issuerRoutes/jwtVc.
 * Defaults to BitstringStatusListCredential (VCDM 2.0).
 */
function buildStatusListCredential(issuerDid, baseUrl, listId = DEFAULT_LIST_ID, kind = 'bitstring') {
  return kind === 'statuslist2021'
    ? buildStatusList2021Credential(issuerDid, baseUrl, listId)
    : buildBitstringStatusListCredential(issuerDid, baseUrl, listId);
}

/**
 * Per-credential status entry. Type defaults to BitstringStatusListEntry (VCDM 2.0).
 * Pass 'StatusList2021Entry' for the legacy form.
 */
function buildCredentialStatusEntry(baseUrl, listId, index, type = 'BitstringStatusListEntry') {
  return {
    id: `${baseUrl}/api/badges/status/${listId}#${index}`,
    type,
    statusPurpose: 'revocation',
    statusListIndex: String(index),
    statusListCredential: `${baseUrl}/api/badges/status/${listId}`
  };
}

/**
 * Decode an encodedList string from a status list credential.
 * Supports BitstringStatusList (multibase 'u' base64url-no-pad) and StatusList2021 (base64).
 */
function decodeEncodedList(encoded) {
  if (!encoded || typeof encoded !== 'string') throw new Error('encodedList missing');
  let raw;
  if (encoded.startsWith('u')) {
    raw = Buffer.from(encoded.slice(1), 'base64url');
  } else if (encoded.startsWith('z')) {
    throw new Error('base58 multibase encoding not supported');
  } else {
    raw = Buffer.from(encoded, 'base64');
  }
  return zlib.gunzipSync(raw);
}

module.exports = {
  DEFAULT_LIST_ID,
  LIST_BITS,
  nextIndex,
  setRevoked,
  isRevoked,
  loadBuffer,
  buildStatusListCredential,
  buildBitstringStatusListCredential,
  buildStatusList2021Credential,
  buildCredentialStatusEntry,
  decodeEncodedList
};
