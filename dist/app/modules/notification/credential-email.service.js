"use strict";
/**
 * SCRUM-108: email delivery channel for credential alerts.
 *
 * SCRUM-102 confirmed the SCRUM-65 triggers fire end-to-end, but delivery was
 * in-app only, so a caregiver who is not in the app misses everything. This adds
 * email ALONGSIDE the in-app notification for the same four triggers:
 *
 *   yellow    - 61 -> 60 days out
 *   red       - 31 -> 30 days out
 *   expired   - crosses 0
 *   rejected  - real-time, from the admin not-confirmed action (SCRUM-51/109)
 *
 * Provider: Resend, already integrated in modules/auth/sendMail.ts and used for
 * agency login codes. wevoro.com is domain-verified (SPF/DKIM), so no new
 * provider selection was needed for requirement #1.
 *
 * Design notes from the ticket:
 *  - every template carries a primary CTA deep-linking to the credential screen
 *  - the rejection email carries the SPECIFIC admin reason, not a generic line
 *  - one email per credential event (no batching this round)
 *  - renewal reuses the yellow-band template for the new lifecycle
 *  - NO "notification preferences" footer - WeVoro has no preferences system yet,
 *    so a link implying user control would be misleading (Gene, review comment)
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCredentialEmail = exports.renderCredentialEmail = void 0;
const config_1 = __importDefault(require("../../../config"));
const user_model_1 = require("../user/user.model");
const sendMail_1 = require("../auth/sendMail");
/** Brand tokens lifted from the admin credential-confirmation screens. */
const BRAND = {
    green: '#008000',
    darkGreen: '#01400F',
    text: '#1C1C1C',
    muted: '#6C6C6C',
    border: '#DFE2E0',
    amber: '#A9700B',
    amberBg: '#FEF3D7',
    red: '#E94435',
    redBg: '#FDE8E8',
    page: '#F9F9FA',
};
const appUrl = () => config_1.default.frontend_url.prod || config_1.default.frontend_url.local || 'https://wevoro.com';
const credentialLink = () => `${appUrl()}/pro/profile#credentials`;
const TEMPLATES = {
    yellow: {
        subject: (c) => `Your ${c} expires in 60 days`,
        heading: 'Your credential expires in 60 days',
        body: (c, d) => `Your <strong>${c}</strong> expires in ${d} days. Renewing early keeps your profile active and visible to agencies.`,
        cta: 'Renew credential',
        accent: BRAND.amber,
        accentBg: BRAND.amberBg,
    },
    red: {
        subject: (c) => `Action needed: your ${c} expires in 30 days`,
        heading: 'Your credential expires in 30 days',
        body: (c, d) => `Your <strong>${c}</strong> expires in ${d} days. Please renew now &mdash; once it expires your profile is no longer shown as ready to work.`,
        cta: 'Renew now',
        accent: BRAND.red,
        accentBg: BRAND.redBg,
    },
    expired: {
        subject: (c) => `Your ${c} has expired`,
        heading: 'Your credential has expired',
        body: (c) => `Your <strong>${c}</strong> has expired. Upload a current document to get back to ready-to-work status.`,
        cta: 'Renew credential',
        accent: BRAND.red,
        accentBg: BRAND.redBg,
    },
    rejected: {
        subject: (c) => `Your ${c} submission needs attention`,
        heading: 'Your credential submission needs attention',
        body: (c) => `We reviewed your <strong>${c}</strong> and it could not be confirmed. The reason is below.`,
        cta: 'Resubmit document',
        accent: BRAND.red,
        accentBg: BRAND.redBg,
    },
};
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const renderEmail = (params) => {
    const { kind, credentialName, days, reason } = params;
    const t = TEMPLATES[kind];
    const safeName = escape(credentialName);
    // Rejection carries the admin specific reason so the caregiver does not have
    // to open the app just to find out what was wrong.
    const reasonBlock = kind === 'rejected' && reason
        ? `<tr><td style="padding:0 32px 8px">
           <div style="background:${BRAND.redBg};border-radius:10px;padding:14px 16px">
             <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;font-weight:bold;color:${BRAND.red}">Reason</p>
             <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${BRAND.red}">${escape(reason)}</p>
           </div>
         </td></tr>`
        : '';
    return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BRAND.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 32px 0">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;font-weight:bold;color:${BRAND.green}">Wevoro</p>
      </td></tr>
      <tr><td style="padding:20px 32px 0">
        <span style="display:inline-block;background:${t.accentBg};color:${t.accent};border-radius:999px;padding:5px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:500">${safeName}</span>
      </td></tr>
      <tr><td style="padding:12px 32px 0">
        <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;font-weight:bold;color:${BRAND.text}">${t.heading}</h1>
      </td></tr>
      <tr><td style="padding:10px 32px 20px">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:${BRAND.muted}">${t.body(safeName, days)}</p>
      </td></tr>
      ${reasonBlock}
      <tr><td style="padding:12px 32px 28px">
        <a href="${credentialLink()}"
           style="display:inline-block;background:${BRAND.green};color:#FFFFFF;text-decoration:none;border-radius:10px;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold">${t.cta}</a>
      </td></tr>
      <tr><td style="padding:0 32px 28px;border-top:1px solid ${BRAND.border}">
        <p style="margin:16px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${BRAND.muted}">
          You are receiving this automated alert because a credential on your WeVoro account needs attention.
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${BRAND.muted}">
          Wevoro &middot; <a href="${appUrl()}" style="color:${BRAND.darkGreen}">www.wevoro.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
};
/** Exposed for tests/preview so the templates can be rendered without sending. */
exports.renderCredentialEmail = renderEmail;
/**
 * Send one credential alert email. Never throws - a mail failure must not stop
 * the cron or roll back the admin decision; the in-app notification has already
 * been written by the caller either way.
 */
const sendCredentialEmail = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, kind, credentialName, days = 0, reason } = params;
    try {
        const user = yield user_model_1.User.findById(userId).select('email');
        if (!(user === null || user === void 0 ? void 0 : user.email)) {
            console.warn(`[SCRUM-108] no email on record for user ${userId}; skipped ${kind}`);
            return;
        }
        const t = TEMPLATES[kind];
        yield (0, sendMail_1.sendEmail)(user.email, t.subject(credentialName, days), renderEmail({ kind, credentialName, days, reason }));
        console.log(`[SCRUM-108] ${kind} email sent to ${user.email} for ${credentialName}`);
    }
    catch (err) {
        console.error(`[SCRUM-108] ${kind} email FAILED for user ${userId}:`, err === null || err === void 0 ? void 0 : err.message);
    }
});
exports.sendCredentialEmail = sendCredentialEmail;
