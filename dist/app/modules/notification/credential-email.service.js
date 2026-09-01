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
 * MARKUP: these templates follow Faisal's approved Figma designs
 * (file a2PjlZwy00TTdGFLpC59VX, node 10470-3949, "Claude Designs" page):
 * green header bar with the brand lockup, a tinted status emblem, an uppercase
 * eyebrow, the heading, a greeting paragraph, a grey detail card of labelled
 * rows, the CTA, an automated-alert note, and the footer signature.
 *
 * Two deliberate departures, both forced by email clients rather than design:
 *  - The Figma icons are SVG and the brand type is Averia Serif Libre / Lora.
 *    Gmail strips <svg> and no client has those fonts, so the emblems and the
 *    two brand lockups are pre-rendered PNGs (public/email/*.png in the
 *    frontend) built from the exact exported assets at 2x for retina.
 *  - Everything else is live text in a web-safe stack, so the mail still reads
 *    correctly with images turned off.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCredentialEmail = exports.renderCredentialEmail = void 0;
const user_model_1 = require("../user/user.model");
const personal_info_model_1 = require("../user/personal-info.model");
const sendMail_1 = require("../auth/sendMail");
/** Tokens read from the approved Figma file. */
const C = {
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
/**
 * Public base URL used for the CTA link and the email images.
 *
 * Deliberately NOT config.frontend_url: that value is a leftover pointing at
 * qa.joinhirenza.com, a different product, so every CTA would have sent
 * caregivers to the wrong domain. Set APP_PUBLIC_URL per environment.
 */
const appUrl = () => (process.env.APP_PUBLIC_URL || 'https://wevoro.com').replace(/\/+$/, '');
const asset = (file) => `${appUrl()}/email/${file}`;
const credentialLink = () => `${appUrl()}/pro/profile#credentials`;
const SANS = 'Arial,Helvetica,sans-serif';
const SPECS = {
    yellow: {
        subject: (c) => `Your ${c} expires in 60 days`,
        eyebrow: 'EXPIRES IN 60 DAYS',
        accent: C.amber,
        emblem: 'emblem-yellow.png',
        heading: 'Your credential expires in 60 days',
        intro: () => 'keeping your credentials current keeps you eligible for offers on WeVoro. One of your credentials will expire in 60 days &mdash; you can upload an updated document now so there&rsquo;s no gap in your eligibility. No action is required today.',
        rowLabel: 'EXPIRES',
        rowValue: ({ expiresOn, days }) => `${expiresOn} &middot; ${days} days from today`,
        cta: 'View credential',
        note: 'This is an automated alert from WeVoro. No action is needed if you have already uploaded an updated document.',
    },
    red: {
        subject: (c) => `Your ${c} expires in 30 days`,
        eyebrow: 'EXPIRES IN 30 DAYS &middot; ACTION NEEDED',
        accent: C.red,
        emblem: 'emblem-red.png',
        heading: 'Your credential expires in 30 days',
        intro: () => 'one of your credentials will expire in 30 days. To stay eligible for offers, please upload an updated document before it expires &mdash; credentials that lapse will pause your eligibility until a valid document is on file.',
        rowLabel: 'EXPIRES',
        rowValue: ({ expiresOn, days }) => `${expiresOn} &middot; ${days} days from today`,
        cta: 'Upload updated document',
        note: 'This is an automated alert from WeVoro. Disregard if you have already uploaded an updated document.',
    },
    expired: {
        subject: (c) => `Your ${c} has expired`,
        eyebrow: 'CREDENTIAL EXPIRED',
        accent: C.red,
        emblem: 'emblem-expired.png',
        heading: 'Your credential has expired',
        intro: () => 'one of your credentials expired today, so your profile is now paused for offers that require it. Upload an updated document to restore your eligibility right away.',
        rowLabel: 'EXPIRED ON',
        rowValue: ({ expiresOn }) => expiresOn,
        cta: 'Upload updated document',
        note: 'This is an automated alert from WeVoro.',
    },
    rejected: {
        subject: (c) => `Your ${c} submission needs attention`,
        eyebrow: 'ACTION NEEDED',
        accent: C.red,
        emblem: 'emblem-rejected.png',
        heading: 'Your credential submission needs attention',
        intro: () => 'an admin reviewed your recent credential submission and couldn&rsquo;t confirm it for the reason below. Please upload a corrected document so we can complete your verification.',
        rowLabel: 'REASON',
        rowValue: ({ reason }) => reason,
        cta: 'Resubmit document',
        note: 'This is an automated alert from WeVoro. Reply to this email if you have questions about the decision.',
    },
};
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
    : 'Not on file';
/** One labelled row inside the grey detail card. */
const row = (label, value, topPad) => `
  <tr><td style="padding:${topPad}px 0 0 0;font-family:${SANS};font-size:11px;
      letter-spacing:0.4px;color:${C.meta};font-weight:500">${label}</td></tr>
  <tr><td style="padding:3px 0 0 0;font-family:${SANS};font-size:14px;line-height:20px;
      color:${C.heading};font-weight:bold">${value}</td></tr>`;
const renderEmail = (params) => {
    const { kind, credentialName, firstName, days = 0, expiresOn, reason } = params;
    const s = SPECS[kind];
    const name = escape(credentialName);
    const hi = escape(firstName || 'there');
    const value = s.rowValue({
        expiresOn: escape(formatDate(expiresOn)),
        days,
        reason: escape(reason || 'Review required'),
    });
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(s.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${C.pageBg};padding:20px 12px">
 <tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
         style="width:560px;max-width:100%;background:${C.card};border:1px solid ${C.border};
                border-radius:16px;overflow:hidden">

    <!-- Header -->
    <tr><td style="background:${C.green};padding:24px 32px">
      <img src="${asset('header-lockup.png')}" width="189" height="41"
           alt="Wevoro - CNA Professional Platform"
           style="display:block;border:0;outline:none;text-decoration:none;height:auto">
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <tr><td style="padding:0 0 18px 0">
          <img src="${asset(s.emblem)}" width="56" height="56" alt=""
               style="display:block;border:0;outline:none;height:auto">
        </td></tr>

        <tr><td style="font-family:${SANS};font-size:12px;letter-spacing:0.6px;
            font-weight:bold;color:${s.accent}">${s.eyebrow}</td></tr>
        <tr><td style="padding:6px 0 0 0;font-family:${SANS};font-size:22px;line-height:30px;
            font-weight:bold;color:${C.heading}">${escape(s.heading)}</td></tr>

        <tr><td style="padding:18px 0 0 0;font-family:${SANS};font-size:14px;line-height:22px;
            color:${C.body}">Hi ${hi}, ${s.intro(days)}</td></tr>

        <!-- Detail card -->
        <tr><td style="padding:18px 0 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:${C.detailBg};border:1px solid ${C.border};border-radius:12px">
            <tr><td style="padding:16px 18px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${row('CREDENTIAL', name, 0)}
                ${row(s.rowLabel, value, 14)}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:18px 0 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:${C.green};border-radius:10px">
              <a href="${credentialLink()}"
                 style="display:inline-block;padding:13px 22px;font-family:${SANS};font-size:15px;
                        font-weight:500;color:#FFFFFF;text-decoration:none;letter-spacing:-0.3px">${s.cta}</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:18px 0 0 0;font-family:${SANS};font-size:12px;line-height:17px;
            color:${C.meta}">${s.note}</td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:${C.pageBg};padding:22px 32px">
      <img src="${asset('footer-lockup.png')}" width="137" height="34" alt="Wevoro - www.wevoro.com"
           style="display:block;border:0;outline:none;height:auto">
      <div style="padding:12px 0 0 0;font-family:${SANS};font-size:11px;line-height:16px;color:${C.meta}">
        You&rsquo;re receiving this automated alert because a credential on your WeVoro account needs attention.
      </div>
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
    const { userId, kind, credentialName, days = 0, expiresOn, reason } = params;
    try {
        const user = yield user_model_1.User.findById(userId).select('email');
        if (!(user === null || user === void 0 ? void 0 : user.email)) {
            console.warn(`[SCRUM-108] no email on record for user ${userId}; skipped ${kind}`);
            return;
        }
        // The approved template opens "Hi {{First Name}}," so pull it; fall back to
        // a neutral greeting rather than skipping the send.
        const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName');
        yield (0, sendMail_1.sendEmail)(user.email, SPECS[kind].subject(credentialName), renderEmail({
            kind,
            credentialName,
            firstName: info === null || info === void 0 ? void 0 : info.firstName,
            days,
            expiresOn,
            reason,
        }));
        console.log(`[SCRUM-108] ${kind} email sent to ${user.email} for ${credentialName}`);
    }
    catch (err) {
        console.error(`[SCRUM-108] ${kind} email FAILED for user ${userId}:`, err === null || err === void 0 ? void 0 : err.message);
    }
});
exports.sendCredentialEmail = sendCredentialEmail;
