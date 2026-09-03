"use strict";
/**
 * Shared transactional-email layout, extracted from the SCRUM-108 credential
 * templates so the e-signature emails (SCRUM-117/118) render as the same
 * family: green header lockup, tinted status emblem, uppercase eyebrow,
 * heading, greeting, grey detail card, CTA, note, footer signature.
 *
 * Faisal's approved Figma is the source (file a2PjlZwy00TTdGFLpC59VX,
 * "Claude Designs" page). Emblems and the two brand lockups are pre-rendered
 * PNGs served from the frontend's public/email/ because Gmail strips <svg>
 * and no mail client ships the brand fonts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAlertEmail = exports.emailDetailRow = exports.escapeHtml = exports.emailAsset = exports.emailAppUrl = exports.EMAIL_SANS = exports.EMAIL_COLORS = void 0;
exports.EMAIL_COLORS = {
    green: '#008000',
    pageBg: '#F9F9FA',
    card: '#FFFFFF',
    border: '#DFE2E0',
    heading: '#1C1C1C',
    body: '#6C6C6C',
    meta: '#5E6864',
    detailBg: '#F2F4F3',
    amber: '#FAB607',
    red: '#E94435',
};
exports.EMAIL_SANS = 'Arial,Helvetica,sans-serif';
/**
 * Public base URL for CTA links and email images. Deliberately NOT
 * config.frontend_url — that value is a leftover pointing at
 * qa.joinhirenza.com, a different product. Set APP_PUBLIC_URL per environment.
 */
const emailAppUrl = () => (process.env.APP_PUBLIC_URL || 'https://wevoro.com').replace(/\/+$/, '');
exports.emailAppUrl = emailAppUrl;
const emailAsset = (file) => `${(0, exports.emailAppUrl)()}/email/${file}`;
exports.emailAsset = emailAsset;
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
exports.escapeHtml = escapeHtml;
const C = exports.EMAIL_COLORS;
const SANS = exports.EMAIL_SANS;
/** One labelled row inside the grey detail card. */
const emailDetailRow = (label, value, topPad) => `
  <tr><td style="padding:${topPad}px 0 0 0;font-family:${SANS};font-size:11px;
      letter-spacing:0.4px;color:${C.meta};font-weight:500">${label}</td></tr>
  <tr><td style="padding:3px 0 0 0;font-family:${SANS};font-size:14px;line-height:20px;
      color:${C.heading};font-weight:bold">${value}</td></tr>`;
exports.emailDetailRow = emailDetailRow;
const renderAlertEmail = (p) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${(0, exports.escapeHtml)(p.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${C.pageBg};padding:20px 12px">
 <tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
         style="width:560px;max-width:100%;background:${C.card};border:1px solid ${C.border};
                border-radius:16px;overflow:hidden">

    <!-- Header -->
    <tr><td style="background:${C.green};padding:24px 32px">
      <img src="${(0, exports.emailAsset)('header-lockup.png')}" width="189" height="41"
           alt="Wevoro - CNA Professional Platform"
           style="display:block;border:0;outline:none;text-decoration:none;height:auto">
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <tr><td style="padding:0 0 18px 0">
          <img src="${(0, exports.emailAsset)(p.emblem)}" width="56" height="56" alt=""
               style="display:block;border:0;outline:none;height:auto">
        </td></tr>

        <tr><td style="font-family:${SANS};font-size:12px;letter-spacing:0.6px;
            font-weight:bold;color:${p.accent}">${p.eyebrow}</td></tr>
        <tr><td style="padding:6px 0 0 0;font-family:${SANS};font-size:22px;line-height:30px;
            font-weight:bold;color:${C.heading}">${(0, exports.escapeHtml)(p.heading)}</td></tr>

        <tr><td style="padding:18px 0 0 0;font-family:${SANS};font-size:14px;line-height:22px;
            color:${C.body}">Hi ${p.greetingName}, ${p.intro}</td></tr>

        ${p.detailRowsHtml
    ? `<tr><td style="padding:18px 0 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${C.detailBg};border:1px solid ${C.border};border-radius:12px">
            <tr><td style="padding:16px 18px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${p.detailRowsHtml}
              </table>
            </td></tr>
          </table>
        </td></tr>`
    : ''}

        <!-- CTA -->
        <tr><td style="padding:18px 0 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${C.green};border-radius:10px">
              <a href="${p.ctaHref}"
                 style="display:inline-block;padding:13px 22px;font-family:${SANS};font-size:15px;
                        font-weight:500;color:#FFFFFF;text-decoration:none;letter-spacing:-0.3px">${p.cta}</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:18px 0 0 0;font-family:${SANS};font-size:12px;line-height:17px;
            color:${C.meta}">${p.note}</td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:${C.pageBg};padding:22px 32px">
      <img src="${(0, exports.emailAsset)('footer-lockup.png')}" width="137" height="34" alt="Wevoro - www.wevoro.com"
           style="display:block;border:0;outline:none;height:auto">
      <div style="padding:12px 0 0 0;font-family:${SANS};font-size:11px;line-height:16px;color:${C.meta}">
        ${p.footerLine}
      </div>
    </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
exports.renderAlertEmail = renderAlertEmail;
