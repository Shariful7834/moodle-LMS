/**
 * SSRF-resistant fetch wrapper for outbound HTTP made on behalf of users
 * (verifying remote credentials, resolving did:web documents, fetching status lists).
 *
 * - Resolves hostname → IP and rejects private / loopback / link-local / multicast ranges
 *   UNLESS the target host is in ALLOWED_LOCALHOST_HOSTS (e.g. our own dev wallet).
 * - Enforces a 10-second timeout via AbortController.
 * - Allows http:// only for explicitly allow-listed hosts; everything else must be https://.
 */

const net = require('net');
const dns = require('dns').promises;

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '10000', 10);

// Hosts where http:// AND private-IP fetches are permitted (own wallet for did:web localhost dev,
// own Moodle, etc.). Comma-separated env var, default to localhost variants.
const LOCAL_ALLOW = (process.env.SSRF_LOCAL_ALLOW || 'localhost,127.0.0.1,::1')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 127) return true;                       // loopback
  if (a === 169 && b === 254) return true;          // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a >= 224) return true;                         // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true;                          // link-local
  if (lower.startsWith('::ffff:')) {
    return isPrivateIPv4(lower.slice('::ffff:'.length));
  }
  return false;
}

function isPrivateIP(ip) {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return false;
}

function isLocalAllowed(hostname) {
  return LOCAL_ALLOW.includes(hostname.toLowerCase());
}

async function assertSafeUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname;
  // http:// allowed only for explicitly allow-listed local hosts
  if (parsed.protocol === 'http:' && !isLocalAllowed(host)) {
    throw new Error(`http:// disallowed for host ${host} (use https or allow-list)`);
  }
  // Resolve DNS — block if any A/AAAA record points at private/loopback range
  if (net.isIP(host)) {
    if (isPrivateIP(host) && !isLocalAllowed(host)) {
      throw new Error(`Refusing to fetch private IP ${host}`);
    }
    return;
  }
  if (isLocalAllowed(host)) return;
  let addrs = [];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new Error(`DNS lookup failed for ${host}: ${e.message}`);
  }
  for (const a of addrs) {
    if (isPrivateIP(a.address)) {
      throw new Error(`Refusing to fetch ${host} → private IP ${a.address}`);
    }
  }
}

/**
 * SSRF-safe fetch with timeout.
 */
async function safeFetch(url, init = {}) {
  await assertSafeUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('Fetch timeout')), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { safeFetch, assertSafeUrl, isPrivateIP };
