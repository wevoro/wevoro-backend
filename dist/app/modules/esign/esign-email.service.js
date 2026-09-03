"use strict";
/**
 * SCRUM-117/118: e-signature emails.
 *
 * Every caregiver-facing communication in the signing flow ships via email in
 * addition to in-app (2026-08-31 meeting decision), and the agency's signing-
 * complete notice ships via email for the same reason SCRUM-108 did it for
 * credential alerts: in-app alone is missed when nobody is in the app, which
 * stalls onboarding at the exact moment WeVoro is meant to speed it up.
 *
 * Templates ride the shared SCRUM-108 layout (email-layout.ts) so the whole
 * family looks the same. No preferences footer: WeVoro has no notification
 * preferences system yet, so a link implying control would be misleading.
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
exports.sendOfferReceivedEmail = exports.sendSigningCompleteEmail = exports.sendDocumentReplacedEmail = exports.sendSignatureReminderEmail = void 0;
const user_model_1 = require("../user/user.model");
const personal_info_model_1 = require("../user/personal-info.model");
const sendMail_1 = require("../auth/sendMail");
const email_layout_1 = require("../notification/email-layout");
const CAREGIVER_FOOTER = 'You&rsquo;re receiving this automated alert because an agency on WeVoro is waiting on your documents.';
const AGENCY_FOOTER = 'You&rsquo;re receiving this automated alert because a caregiver connected to your agency completed their signing documents.';
const firstNameOf = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName');
    return (0, email_layout_1.escapeHtml)((info === null || info === void 0 ? void 0 : info.firstName) || 'there');
});
const deliver = (userId, subject, html, tag) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield user_model_1.User.findById(userId).select('email');
        if (!(user === null || user === void 0 ? void 0 : user.email)) {
            console.warn(`[esign] no email on record for user ${userId}; skipped ${tag}`);
            return;
        }
        yield (0, sendMail_1.sendEmail)(user.email, subject, html);
        console.log(`[esign] ${tag} email sent to ${user.email}`);
    }
    catch (err) {
        // A mail failure must never break the signing flow or the cron.
        console.error(`[esign] ${tag} email FAILED for user ${userId}:`, err === null || err === void 0 ? void 0 : err.message);
    }
});
/** SCRUM-118: reminder while signing is stalled (Step 1 done, Step 2 not). */
const sendSignatureReminderEmail = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { caregiverId, agencyName, pendingCount } = params;
    const n = pendingCount;
    const docWord = n === 1 ? 'document' : 'documents';
    const html = (0, email_layout_1.renderAlertEmail)({
        emblem: 'emblem-yellow.png',
        eyebrow: 'SIGNATURE NEEDED',
        accent: email_layout_1.EMAIL_COLORS.amber,
        heading: `Your signature is needed on ${n} ${docWord}`,
        greetingName: yield firstNameOf(caregiverId),
        intro: `${(0, email_layout_1.escapeHtml)(agencyName)} is waiting on your signature to finish your onboarding. It only takes a minute &mdash; pick up right where you left off.`,
        detailRowsHtml: (0, email_layout_1.emailDetailRow)('AGENCY', (0, email_layout_1.escapeHtml)(agencyName), 0) +
            (0, email_layout_1.emailDetailRow)('WAITING FOR YOU', `${n} ${docWord} to sign`, 14),
        cta: 'Finish signing',
        ctaHref: `${(0, email_layout_1.emailAppUrl)()}/pro/offers`,
        note: 'This is an automated alert from WeVoro. Disregard if you have already finished signing.',
        footerLine: CAREGIVER_FOOTER,
    });
    yield deliver(caregiverId, `Your signature is needed on ${n} ${docWord}`, html, 'reminder');
});
exports.sendSignatureReminderEmail = sendSignatureReminderEmail;
/** SCRUM-117: a document awaiting the caregiver's signature was replaced. */
const sendDocumentReplacedEmail = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { caregiverId, agencyName, documentTitle } = params;
    const html = (0, email_layout_1.renderAlertEmail)({
        emblem: 'emblem-replaced.png',
        eyebrow: 'DOCUMENT UPDATED',
        accent: email_layout_1.EMAIL_COLORS.amber,
        heading: 'A document you were signing was updated',
        greetingName: yield firstNameOf(caregiverId),
        intro: `${(0, email_layout_1.escapeHtml)(agencyName)} replaced one of the documents in your signing packet. The earlier version is no longer valid &mdash; please review and sign the new version.`,
        detailRowsHtml: (0, email_layout_1.emailDetailRow)('DOCUMENT', (0, email_layout_1.escapeHtml)(documentTitle), 0) +
            (0, email_layout_1.emailDetailRow)('AGENCY', (0, email_layout_1.escapeHtml)(agencyName), 14),
        cta: 'Review & sign new version',
        ctaHref: `${(0, email_layout_1.emailAppUrl)()}/pro/offers`,
        note: 'This is an automated alert from WeVoro.',
        footerLine: CAREGIVER_FOOTER,
    });
    yield deliver(caregiverId, `Updated: ${documentTitle} needs your signature again`, html, 'replaced');
});
exports.sendDocumentReplacedEmail = sendDocumentReplacedEmail;
/** SCRUM-117: agency notice on FULL completion only — never per-document. */
const sendSigningCompleteEmail = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { agencyId, caregiverName, role, count } = params;
    const docWord = count === 1 ? 'document' : 'documents';
    const html = (0, email_layout_1.renderAlertEmail)({
        emblem: 'emblem-complete.png',
        eyebrow: 'SIGNING COMPLETE',
        accent: email_layout_1.EMAIL_COLORS.green,
        heading: `${(0, email_layout_1.escapeHtml)(caregiverName)} signed all your documents`,
        greetingName: yield firstNameOf(agencyId),
        intro: `${(0, email_layout_1.escapeHtml)(caregiverName)} has completed every ${(0, email_layout_1.escapeHtml)(role)} signing ${docWord} for your agency. Nothing else is needed from them on this step.`,
        detailRowsHtml: (0, email_layout_1.emailDetailRow)('CAREGIVER', (0, email_layout_1.escapeHtml)(caregiverName), 0) +
            (0, email_layout_1.emailDetailRow)('SIGNED', `${count} of ${count} ${docWord}`, 14),
        cta: 'View caregiver',
        ctaHref: `${(0, email_layout_1.emailAppUrl)()}/partner/onboardings`,
        note: 'This is an automated alert from WeVoro.',
        footerLine: AGENCY_FOOTER,
    });
    yield deliver(agencyId, `${caregiverName} signed all your documents`, html, 'complete');
});
exports.sendSigningCompleteEmail = sendSigningCompleteEmail;
/** SCRUM-118: offer-received parity email (in-app existed already). */
const sendOfferReceivedEmail = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { caregiverId, agencyName, signCount } = params;
    const extra = signCount > 0
        ? ` It includes ${signCount} ${signCount === 1 ? 'document' : 'documents'} to sign, so have a couple of minutes ready.`
        : '';
    const html = (0, email_layout_1.renderAlertEmail)({
        emblem: 'emblem-offer.png',
        eyebrow: 'NEW OFFER',
        accent: email_layout_1.EMAIL_COLORS.green,
        heading: `${(0, email_layout_1.escapeHtml)(agencyName)} sent you an offer`,
        greetingName: yield firstNameOf(caregiverId),
        intro: `you have a new offer waiting on WeVoro.${extra}`,
        detailRowsHtml: (0, email_layout_1.emailDetailRow)('FROM', (0, email_layout_1.escapeHtml)(agencyName), 0),
        cta: 'View offer',
        ctaHref: `${(0, email_layout_1.emailAppUrl)()}/pro/offers`,
        note: 'This is an automated alert from WeVoro.',
        footerLine: CAREGIVER_FOOTER,
    });
    yield deliver(caregiverId, `${agencyName} sent you an offer on WeVoro`, html, 'offer-received');
});
exports.sendOfferReceivedEmail = sendOfferReceivedEmail;
