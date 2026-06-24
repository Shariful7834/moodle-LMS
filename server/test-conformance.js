/**
 * End-to-end conformance test.
 * Run: node test-conformance.js
 *
 * Exercises every credential-issuance, verification, and revocation path,
 * checks every Tier 1 spec compliance fix, and asserts known-good shape.
 *
 * Requires the wallet server running on http://localhost:4000.
 */

const BASE = process.env.BASE_URL || 'http://localhost:4000';

let pass = 0, fail = 0;
const failures = [];

function t(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(name) { console.log(`\n=== ${name} ===`); }

async function http(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, ct, headers: res.headers, body };
}

async function login(email, password) {
  const r = await http('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return r.body.token;
}

function decodeB64Url(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function decodeJwtParts(jwt) {
  const [h, p, s] = jwt.split('.');
  return {
    header: JSON.parse(decodeB64Url(h).toString('utf8')),
    payload: JSON.parse(decodeB64Url(p).toString('utf8')),
    sig: s
  };
}

(async () => {
  section('1. Health + DID resolution');
  const health = await http('/api/health');
  t('GET /api/health 200', health.status === 200);
  t('health.status=ok', health.body.status === 'ok');

  const did = await http('/api/badges/issuer/did.json');
  t('GET /api/badges/issuer/did.json 200', did.status === 200);
  t('DID @context includes did/v1', did.body['@context']?.includes('https://www.w3.org/ns/did/v1'));
  t('DID id starts did:web:', did.body.id?.startsWith('did:web:'));
  t('DID has verificationMethod', Array.isArray(did.body.verificationMethod) && did.body.verificationMethod.length > 0);
  t('DID VM is JsonWebKey2020', did.body.verificationMethod[0]?.type === 'JsonWebKey2020');
  t('DID VM has publicKeyJwk', !!did.body.verificationMethod[0]?.publicKeyJwk);
  t('DID VM publicKeyJwk crv=P-256', did.body.verificationMethod[0]?.publicKeyJwk?.crv === 'P-256');
  t('DID assertionMethod includes VM', did.body.assertionMethod?.includes(did.body.verificationMethod[0].id));
  t('DID CORS *', did.headers.get('access-control-allow-origin') === '*');

  const wellKnownDid = await http('/.well-known/did.json');
  t('GET /.well-known/did.json 200', wellKnownDid.status === 200);
  t('wellknown DID id matches', wellKnownDid.body.id === did.body.id);

  const jwks = await http('/.well-known/jwks.json');
  t('GET /.well-known/jwks.json 200', jwks.status === 200);
  t('jwks.keys array', Array.isArray(jwks.body.keys) && jwks.body.keys.length === 1);
  t('jwks key alg=ES256', jwks.body.keys[0].alg === 'ES256');

  section('2. Issuer profile');
  const profile = await http('/api/badges/issuer');
  t('GET /api/badges/issuer 200', profile.status === 200);
  t('profile.type includes Profile', profile.body.type?.includes('Profile'));
  t('profile.id matches DID', profile.body.id === did.body.id);

  section('3. Login');
  const adminTok = await login('admin@wallet.local', 'admin123');
  t('admin login token', !!adminTok);
  const studentTok = await login('student@university.edu', 'student123');
  t('student login token', !!studentTok);

  section('4. Issue credential via approve-claim');
  const annName = `Conformance Test ${Date.now()}`;
  const annResp = await http('/api/announce-certificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'moodle-api-key-2024' },
    body: JSON.stringify({
      achievement_name: annName,
      achievement_description: 'Comprehensive end-to-end conformance test',
      achievement_type: 'Certificate',
      issuer_name: 'Conformance Issuer',
      criteria: 'Pass all Tier 1 spec checks'
    })
  });
  t('announce 201', annResp.status === 201, `status=${annResp.status}`);
  const annId = annResp.body.announcementId;

  const claimResp = await http(`/api/credentials/claim/${annId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${studentTok}` }
  });
  t('claim 201', claimResp.status === 201);
  const claimId = claimResp.body.claim?.id || claimResp.body.claimId;

  const approve = await http(`/api/credentials/approve-claim/${claimId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminTok}`, 'Content-Type': 'application/json' }
  });
  t('approve 200', approve.status === 200);
  const credId = approve.body.credentialId;
  const jwt = approve.body.jwt;
  t('approve returned jwt', typeof jwt === 'string' && jwt.split('.').length === 3);
  t('approve returned vc', !!approve.body.vc);

  section('5. JWT envelope (header + payload conformance)');
  const parts = decodeJwtParts(jwt);
  t('header.alg=ES256', parts.header.alg === 'ES256');
  t('header.typ=vc+jwt', parts.header.typ === 'vc+jwt');
  t('header.cty=vc', parts.header.cty === 'vc');
  t('header.kid is did:web url with #fragment', /^did:web:.+#/.test(parts.header.kid));
  t('payload.iss is did:web', parts.payload.iss?.startsWith('did:web:'));
  t('payload.sub is mailto:', parts.payload.sub?.startsWith('mailto:'));
  t('payload.jti = vc.id', parts.payload.jti === parts.payload.vc.id);
  t('payload.iat present', typeof parts.payload.iat === 'number');
  t('payload.nbf present', typeof parts.payload.nbf === 'number');
  t('kid controller matches iss', parts.header.kid.split('#')[0] === parts.payload.iss);

  section('6. VC payload (W3C VCDM 2.0 + OB 3.0 conformance)');
  const vc = parts.payload.vc;
  t('@context first item = credentials/v2', vc['@context']?.[0] === 'https://www.w3.org/ns/credentials/v2');
  t('@context includes OB 3.0 context-3.0.3.json', vc['@context']?.includes('https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'));
  t('type includes VerifiableCredential', vc.type?.includes('VerifiableCredential'));
  t('type includes OpenBadgeCredential', vc.type?.includes('OpenBadgeCredential'));
  t('vc.id is HTTPS/HTTP URL', /^https?:\/\//.test(vc.id));
  t('vc.id is dereferenceable path /api/badges/credentials/<uuid>', vc.id.includes('/api/badges/credentials/'));
  t('vc.name present', typeof vc.name === 'string' && vc.name.length > 0);
  t('vc.description present (top-level, C7)', typeof vc.description === 'string' && vc.description.length > 0);
  t('vc.validFrom is ISO 8601', /^\d{4}-\d{2}-\d{2}T/.test(vc.validFrom));
  t('vc.validUntil is ISO 8601', /^\d{4}-\d{2}-\d{2}T/.test(vc.validUntil));

  // Issuer
  t('issuer.id is did:web', vc.issuer?.id?.startsWith('did:web:'));
  t('issuer.type includes Profile', vc.issuer?.type?.includes('Profile'));
  t('issuer.name present', typeof vc.issuer?.name === 'string');

  // Subject
  t('credentialSubject.id is mailto:', vc.credentialSubject?.id?.startsWith('mailto:'));
  t('credentialSubject.type includes AchievementSubject', vc.credentialSubject?.type?.includes('AchievementSubject'));

  // Achievement
  const ach = vc.credentialSubject?.achievement;
  t('achievement.id is HTTPS/HTTP URL', /^https?:\/\//.test(ach?.id || ''));
  t('achievement.type includes Achievement', ach?.type?.includes('Achievement'));
  t('achievement.name present', typeof ach?.name === 'string');
  t('achievement.description present', typeof ach?.description === 'string');
  t('achievement.criteria.narrative present', typeof ach?.criteria?.narrative === 'string');
  t('achievement.image is Image object', ach?.image?.type === 'Image' && typeof ach?.image?.id === 'string');

  // Identifier (C5: per-credential salt)
  const ident = vc.credentialSubject?.identifier?.[0];
  t('identifier.type=IdentityObject', ident?.type === 'IdentityObject');
  t('identifier.identityType=emailAddress', ident?.identityType === 'emailAddress');
  t('identifier.hashed=true', ident?.hashed === true);
  t('identifier.salt is hex (per-credential)', /^[0-9a-f]{32}$/.test(ident?.salt || ''));
  t('identifier.identityHash is sha256$<hex>', /^sha256\$[0-9a-f]{64}$/.test(ident?.identityHash || ''));

  // credentialSchema
  t('credentialSchema 1EdTechJsonSchemaValidator2019', vc.credentialSchema?.[0]?.type === '1EdTechJsonSchemaValidator2019');

  // credentialStatus (C4: BitstringStatusList)
  t('credentialStatus.type=BitstringStatusListEntry', vc.credentialStatus?.type === 'BitstringStatusListEntry');
  t('credentialStatus.statusPurpose=revocation', vc.credentialStatus?.statusPurpose === 'revocation');
  t('credentialStatus.statusListIndex is numeric string', /^\d+$/.test(vc.credentialStatus?.statusListIndex || ''));
  t('credentialStatus.statusListCredential is HTTPS/HTTP URL', /^https?:\/\//.test(vc.credentialStatus?.statusListCredential || ''));

  section('7. Per-credential salt uniqueness (C5)');
  // Issue a second credential under same student → salt must differ
  const ann2 = await http('/api/announce-certificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'moodle-api-key-2024' },
    body: JSON.stringify({ achievement_name: `Salt Test ${Date.now()}`, achievement_description: 'salt uniqueness', achievement_type: 'Certificate', issuer_name: 'Salt', criteria: 'unique' })
  });
  const claim2 = await http(`/api/credentials/claim/${ann2.body.announcementId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${studentTok}` } });
  const approve2 = await http(`/api/credentials/approve-claim/${claim2.body.claim.id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminTok}`, 'Content-Type': 'application/json' } });
  const salt2 = approve2.body.vc.credentialSubject.identifier[0].salt;
  t('second credential salt differs from first', salt2 !== ident.salt);
  t('second salt also hex 32', /^[0-9a-f]{32}$/.test(salt2));

  section('8. Public dereferenceable URLs');
  // Default JWT
  const credUrlJwt = await http(`/api/badges/credentials/${credId}`);
  t('default credential URL returns vc+jwt', credUrlJwt.ct.includes('application/vc+jwt'));
  t('credential URL JWT body is 3-segment', typeof credUrlJwt.body === 'string' && credUrlJwt.body.split('.').length === 3);

  // Explicit JSON-LD
  const credUrlJson = await http(`/api/badges/credentials/${credId}`, { headers: { Accept: 'application/vc+ld+json' } });
  t('Accept vc+ld+json returns JSON-LD', credUrlJson.ct.includes('application/vc+ld+json'));
  t('JSON-LD body has @context', !!credUrlJson.body['@context']);

  // Download form
  const credDl = await http(`/api/badges/credentials/${credId}?format=jwt&download=1`);
  t('download=1 sets Content-Disposition', /attachment; filename=/.test(credDl.headers.get('content-disposition') || ''));

  // Achievement URL
  const achUrl = ach.id.replace(/^https?:\/\/[^/]+/, '');
  const achResp = await http(achUrl);
  t('achievement URL resolves 200', achResp.status === 200);
  t('achievement URL returns Achievement', achResp.body?.type?.includes('Achievement'));

  section('9. Status list (C1 + C4)');
  const slUrl = vc.credentialStatus.statusListCredential.replace(/^https?:\/\/[^/]+/, '');
  // Default (generic fetch) returns JSON-LD with a readable encodedList for verifier interop.
  const slDefault = await http(slUrl);
  t('default status list returns JSON-LD (interop)', slDefault.ct.includes('application/vc+ld+json'));
  t('default status list has encodedList', !!slDefault.body?.credentialSubject?.encodedList);
  // Signed JWT-VC form is available on explicit request.
  const slJwt = await http(slUrl, { headers: { Accept: 'application/vc+jwt' } });
  t('explicit Accept vc+jwt returns vc+jwt', slJwt.ct.includes('application/vc+jwt'));
  t('status list JWT 3-segment', typeof slJwt.body === 'string' && slJwt.body.split('.').length === 3);

  const slDecoded = decodeJwtParts(slJwt.body);
  t('status list typ=vc+jwt', slDecoded.header.typ === 'vc+jwt');
  t('status list iss matches issuer', slDecoded.payload.iss === did.body.id);
  t('status list vc.type includes BitstringStatusListCredential', slDecoded.payload.vc.type?.includes('BitstringStatusListCredential'));
  t('status list subject.type=BitstringStatusList', slDecoded.payload.vc.credentialSubject?.type === 'BitstringStatusList');
  t('status list encodedList is multibase u', slDecoded.payload.vc.credentialSubject?.encodedList?.startsWith('u'));

  // JSON-LD form
  const slJson = await http(slUrl, { headers: { Accept: 'application/vc+ld+json' } });
  t('Accept JSON-LD returns JSON-LD status list', slJson.ct.includes('application/vc+ld+json'));
  t('JSON-LD status list type', slJson.body?.type?.includes('BitstringStatusListCredential'));

  // Legacy spec=2021
  const sl2021 = await http(slUrl + '?spec=2021', { headers: { Accept: 'application/vc+ld+json' } });
  t('?spec=2021 returns StatusList2021Credential', sl2021.body?.type?.includes('StatusList2021Credential'));

  section('10. /api/verify with JWT (all 15 checks)');
  const ver = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt })
  });
  t('verify status 200', ver.status === 200);
  t('verify.verified=true', ver.body.verified === true);
  t('verify.mode=jwt', ver.body.mode === 'jwt');
  const expectedChecks = ['context','obContext','type','issuer','subject','achievement','validFrom','expiry','credentialSchema','identifier','signature','didResolution','status','statusListSignature','registered'];
  expectedChecks.forEach(name => {
    const c = ver.body.checks.find(x => x.name === name);
    t(`check ${name} PASS`, c?.passed === true, c?.message);
  });

  section('11. /api/verify by URL');
  const verUrl = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: vc.id })
  });
  t('URL verify verified=true', verUrl.body.verified === true);
  t('URL verify mode=jwt (auto-fetched JWT)', verUrl.body.mode === 'jwt');

  section('12. /api/verify with JSON-LD only (no signature available)');
  const verJson = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: vc })
  });
  t('JSON verify mode=json', verJson.body.mode === 'json');
  t('JSON verify signature check is FAIL informational', verJson.body.checks.find(c => c.name === 'signature')?.passed === false);

  section('13. /api/verify negative tests (I2/I3 hardening)');
  // Tampered signature
  const tampered = jwt + 'xx';
  const verTamp = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt: tampered })
  });
  t('tampered JWT verified=false', verTamp.body.verified === false);
  t('tampered signature FAIL', verTamp.body.checks.find(c => c.name === 'signature')?.passed === false);

  // Malformed
  const verBad = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt: 'not.a.jwt' })
  });
  t('malformed JWT structured failure', verBad.body.verified === false);

  section('14. Revocation (C1) + status check');
  const revResp = await http(`/api/credentials/${credId}/revoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminTok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'conformance test revoke' })
  });
  t('revoke 200', revResp.status === 200);

  const verAfterRev = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt })
  });
  const statusCheck = verAfterRev.body.checks.find(c => c.name === 'status');
  const sigCheck = verAfterRev.body.checks.find(c => c.name === 'signature');
  const slSigCheck = verAfterRev.body.checks.find(c => c.name === 'statusListSignature');
  t('after revoke verified=false', verAfterRev.body.verified === false);
  t('after revoke status=FAIL with REVOKED', statusCheck?.passed === false && /REVOKED/i.test(statusCheck?.message));
  t('after revoke signature still PASS (cred unchanged)', sigCheck?.passed === true);
  t('after revoke status list still signed', slSigCheck?.passed === true);

  // Restore
  const unrev = await http(`/api/credentials/${credId}/unrevoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminTok}` }
  });
  t('unrevoke 200', unrev.status === 200);

  const verRestored = await http('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt })
  });
  t('after unrevoke verified=true again', verRestored.body.verified === true);

  section('15. Auth-protected JWT export');
  const jwtExport = await http(`/api/credentials/${credId}/jwt`, {
    headers: { 'Authorization': `Bearer ${studentTok}` }
  });
  t('GET /api/credentials/:id/jwt for owner 200', jwtExport.status === 200);
  t('JWT export returns 3-segment', jwtExport.body?.split?.('.').length === 3);

  section('16. Existing routes (regression)');
  const credList = await http('/api/credentials', { headers: { 'Authorization': `Bearer ${studentTok}` } });
  t('student GET /api/credentials 200', credList.status === 200);
  t('credentials list non-empty', credList.body.credentials?.length > 0);

  const credDetail = await http(`/api/credentials/${credId}`, { headers: { 'Authorization': `Bearer ${studentTok}` } });
  t('GET /api/credentials/:id 200', credDetail.status === 200);
  t('detail.ob3 has issuer.id', !!credDetail.body.ob3?.issuer?.id);
  t('detail.ob3 subject id mailto:', credDetail.body.ob3?.credentialSubject?.id?.startsWith('mailto:'));

  const stats = await http('/api/admin/stats', { headers: { 'Authorization': `Bearer ${adminTok}` } });
  t('admin stats 200', stats.status === 200);

  section('Summary');
  console.log(`\nTotal: ${pass + fail}  PASS: ${pass}  FAIL: ${fail}`);
  if (failures.length > 0) {
    console.log('\nFailed checks:');
    failures.forEach(f => console.log(' - ' + f));
    process.exit(1);
  } else {
    console.log('\nALL CHECKS PASS');
    process.exit(0);
  }
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
