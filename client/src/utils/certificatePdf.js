import QRCode from 'qrcode';

/**
 * Generate a branded, print-ready certificate PDF for an Open Badges 3.0 credential,
 * including a QR code that opens the verification page when scanned.
 *
 * Uses the browser print pipeline (window.open + print) — no server-side rendering and
 * no heavy PDF dependency. The QR encodes a deep link to our /verify page, which
 * auto-verifies the credential from its public URL.
 *
 * @param {object}  opts
 * @param {object}  opts.cred       wallet credential record (achievementName, issuerName, ...)
 * @param {object}  opts.ob3        the OB3 JSON-LD payload (has .id, .credentialSubject, ...)
 * @param {string}  opts.jwt        the signed JWT-VC (embedded as the cryptographic proof)
 * @param {string} [opts.recipientName]
 * @param {string} [opts.recipientEmail]
 * @param {string[]}[opts.logos]    ISSUER-side logos (e.g. partner universities). These are
 *                                  set by the issuing institution, never by the recipient —
 *                                  the certificate must reflect what the issuer attests.
 * @param {string} [opts.subtitle] optional line under the title (e.g. block-week name),
 *                                  also issuer-defined.
 */
export async function generateCertificatePdf(opts) {
  const { cred, ob3, jwt, recipientName, recipientEmail, subtitle } = opts;

  // Branding is taken from the credential itself (authentic, issuer-attested): the badge
  // image and/or issuer image that the issuer put in the signed credential. Callers may
  // pass extra issuer-side logos, but the recipient never supplies branding.
  const achievementImage = ob3?.credentialSubject?.achievement?.image;
  const issuerImage = ob3?.issuer?.image;
  const imgUrl = (v) => (typeof v === 'string' ? v : v?.id || v?.url || null);
  // Known placeholder that does not resolve — never render it as a broken image.
  const PLACEHOLDERS = ['university.edu/badges/default-badge.png'];
  const isPlaceholder = (u) => PLACEHOLDERS.some((p) => String(u).includes(p));
  const logos = [opts.logos, imgUrl(achievementImage), imgUrl(issuerImage)]
    .flat()
    .filter((u) => u && !isPlaceholder(u));

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const achievement = ob3?.credentialSubject?.achievement || {};
  const title = cred?.achievementName || achievement.name || 'Credential';
  const issuerName = cred?.issuerName || ob3?.issuer?.name || 'Academic Achievement Wallet';
  const description = achievement.description || cred?.achievementDescription || '';
  const criteria = achievement?.criteria?.narrative || '';
  const issued = cred?.issuedDate || ob3?.validFrom;
  const issuedStr = issued ? new Date(issued).toLocaleDateString() : '';
  const validUntilStr = ob3?.validUntil ? new Date(ob3.validUntil).toLocaleDateString() : '';
  const isRevoked = cred?.status === 'revoked';

  // What the QR points to: the /verify page on the credential's PUBLIC host (so a phone
  // can reach it), auto-verifying the credential's public URL. The public host is taken
  // from the credential id (the issuer base, e.g. the deployed domain or tunnel); falls
  // back to the current origin only when the credential has no public id (local dev).
  const credentialUrl = ob3?.id ? `${ob3.id}?format=jwt` : '';
  let verifyBase = window.location.origin;
  try { if (ob3?.id) verifyBase = new URL(ob3.id).origin; } catch { /* keep current origin */ }
  const verifyDeepLink = credentialUrl
    ? `${verifyBase}/verify?url=${encodeURIComponent(credentialUrl)}`
    : `${verifyBase}/verify`;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(verifyDeepLink, {
      width: 320, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#1f2937', light: '#ffffff' },
    });
  } catch { /* QR optional — continue without it */ }

  const logosHtml = (logos || []).filter(Boolean)
    .map((src) => `<img class="logo" src="${esc(src)}" alt="" onerror="this.style.display='none'" />`).join('');

  const w = window.open('', '_blank');
  if (!w) { throw new Error('Popup blocked — allow popups to export the PDF'); }

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — Certificate</title>
<style>
  /* Force colours/backgrounds to print (browsers drop them by default). */
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1f2937; }
  .serif { font-family: Georgia, "Times New Roman", serif; }
  .sheet { position: relative; width: 210mm; min-height: 297mm; padding: 16mm; margin: 0 auto; }
  .frame { position: relative; height: 100%; border: 1.5px solid #c7c9e6;
           border-radius: 12px; padding: 16mm 16mm 14mm; overflow: hidden; }
  /* Double inner hairline for a classic certificate feel (borders always print). */
  .frame::after { content: ""; position: absolute; inset: 6px; border: 1px solid #e7e8f5; border-radius: 9px; pointer-events: none; }
  .accent { position: absolute; top: 0; left: 0; right: 0; height: 7px; background: #4f46e5; }
  .accent2 { position: absolute; top: 7px; left: 0; right: 0; height: 2px; background: #a78bfa; }
  .content { position: relative; z-index: 1; }
  .logos { display: flex; gap: 18px; justify-content: center; align-items: center; min-height: 30px; margin-bottom: 16px; }
  .logo { max-height: 52px; max-width: 150px; object-fit: contain; }
  .kicker { text-align: center; color: #4f46e5; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; font-weight: 700; }
  .rule { width: 56px; height: 2px; background: #4f46e5; margin: 12px auto 0; }
  h1 { text-align: center; font-size: 32px; margin: 14px 0 6px; line-height: 1.15; color: #111827; font-weight: 700; }
  .subtitle { text-align: center; color: #6b7280; font-size: 15px; margin-bottom: 2px; }
  .issuer { text-align: center; color: #6b7280; font-size: 13.5px; margin-bottom: 26px; }
  .awarded { text-align: center; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #9ca3af; margin-top: 14px; }
  .recipient { text-align: center; font-size: 30px; color: #1e1b4b; margin: 8px 0 2px; }
  .recipient-email { text-align: center; font-size: 12px; color: #9ca3af; margin-bottom: 20px; }
  .desc { font-size: 14px; color: #374151; line-height: 1.7; text-align: center; max-width: 150mm; margin: 0 auto 8px; }
  .criteria { font-size: 12.5px; color: #6b7280; line-height: 1.6; text-align: center; max-width: 150mm; margin: 0 auto 18px; }
  .meta { display: flex; justify-content: center; gap: 34px; font-size: 13px; color: #4b5563; margin: 14px 0 4px; flex-wrap: wrap; }
  .meta .k { color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta .v { color: #111827; font-weight: 700; }
  .revoked { text-align: center; color: #b91c1c; border: 1.5px solid #fecaca; border-radius: 8px; padding: 8px; font-weight: 700; margin: 12px auto; max-width: 120mm; }
  .verify { display: flex; align-items: center; gap: 18px; justify-content: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid #e5e7eb; }
  .qr-wrap { border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px; }
  .qr { width: 104px; height: 104px; display: block; }
  .verify-text { font-size: 12px; color: #4b5563; max-width: 86mm; line-height: 1.6; }
  .seal { display: inline-block; border: 1.5px solid #4f46e5; color: #4f46e5; border-radius: 999px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.5px; padding: 3px 10px; margin-bottom: 6px; }
  .foot { position: absolute; bottom: 9mm; left: 0; right: 0; text-align: center; color: #9ca3af; font-size: 9.5px; letter-spacing: 0.3px; }
</style></head>
<body onload="window.focus(); window.print();">
  <div class="sheet"><div class="frame">
    <div class="accent"></div><div class="accent2"></div>
    <div class="content">
      ${logosHtml ? `<div class="logos">${logosHtml}</div>` : ''}
      <div class="kicker">Open Badges 3.0 · Verifiable Credential</div>
      <div class="rule"></div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      <div class="issuer">Issued by ${esc(issuerName)}</div>
      ${isRevoked ? '<div class="revoked">⚠ THIS CREDENTIAL HAS BEEN REVOKED</div>' : ''}
      <div class="awarded">This certifies that</div>
      <div class="recipient serif">${esc(recipientName || '')}</div>
      ${recipientEmail ? `<div class="recipient-email">${esc(recipientEmail)}</div>` : ''}
      ${description ? `<div class="desc">${esc(description)}</div>` : ''}
      ${criteria ? `<div class="criteria">${esc(criteria)}</div>` : ''}
      <div class="meta">
        ${issuedStr ? `<div><div class="k">Issued</div><div class="v">${esc(issuedStr)}</div></div>` : ''}
        ${validUntilStr ? `<div><div class="k">Valid until</div><div class="v">${esc(validUntilStr)}</div></div>` : ''}
        <div><div class="k">Signature</div><div class="v">ES256 · did:web</div></div>
      </div>
      <div class="verify">
        ${qrDataUrl ? `<div class="qr-wrap"><img class="qr" src="${qrDataUrl}" alt="Verify QR" /></div>` : ''}
        <div class="verify-text">
          <span class="seal">✓ VERIFIED · OPEN BADGES 3.0</span><br/>
          <b>Scan to verify.</b> A cryptographically signed credential. Scan the QR code to
          independently confirm its signature, issuer and revocation status — no account needed.
        </div>
      </div>
    </div>
    <div class="foot">Academic Achievement Wallet · Open Badges 3.0 · Verify by scanning the QR code</div>
  </div></div>
</body></html>`);
  w.document.close();
}
