"use strict";
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
exports.getReceipt = exports.sendPacketReceipt = exports.receiptNumberFor = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const pricing_model_1 = require("../pricing/pricing.model");
const payment_service_1 = require("./payment.service");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const user_model_1 = require("../user/user.model");
const sendMail_1 = require("../auth/sendMail");
const email_layout_1 = require("../notification/email-layout");
/**
 * SCRUM-142 — WeVoro's own receipt for a credential package.
 *
 * Stripe stays the payment gateway, but the receipt is WeVoro's: agencies must
 * never wonder who charged them. Stripe's automatic receipts were never sent
 * (test mode does not send them, and the account runs Managed Payments), so the
 * success screen's "Stripe has emailed your receipt" was simply untrue.
 *
 * SCRUM-143 — the receipt is stored on the transaction (number, Stripe id,
 * recipient, the rendered email itself), so an admin can open it from the
 * Transactions table without going through Stripe's dashboard.
 */
const money = (cents, currency = 'usd') => `$${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
const formatDay = (d) => new Date(d).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
});
const formatDate = (d) => new Date(d).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
});
/** WV-20260919-3F2A1C: the pay date plus the end of the transaction id. */
const receiptNumberFor = (t) => {
    const d = new Date(t.paidAt || t.transactionDate || Date.now());
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    return `WV-${ymd}-${String(t._id).slice(-6).toUpperCase()}`;
};
exports.receiptNumberFor = receiptNumberFor;
/**
 * The Stripe id to print. The hosted checkout attaches a PaymentIntent only
 * once the agency pays, so it may not be on the row yet — ask the session.
 */
const resolveStripeTransactionId = (t) => __awaiter(void 0, void 0, void 0, function* () {
    if (t.stripePaymentIntentId)
        return t.stripePaymentIntentId;
    if (t.stripeCheckoutSessionId) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { stripeClient } = require('./payment.service');
            const stripe = stripeClient();
            if (stripe) {
                const session = yield stripe.checkout.sessions.retrieve(t.stripeCheckoutSessionId);
                if (typeof session.payment_intent === 'string') {
                    t.stripePaymentIntentId = session.payment_intent;
                    return session.payment_intent;
                }
            }
        }
        catch (_a) {
            // Fall back to the session id, which Stripe's dashboard also finds.
        }
        return t.stripeCheckoutSessionId;
    }
    return null;
});
/**
 * "Visa ending 4242", read from the charge. Best effort: a simulated QA
 * payment has no charge, and Stripe may not expose the card under Managed
 * Payments — then the row simply says "Card".
 */
const resolvePaymentMethod = (stripeId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (!stripeId || !stripeId.startsWith('pi_'))
        return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { stripeClient } = require('./payment.service');
        const stripe = stripeClient();
        if (!stripe)
            return null;
        const pi = yield stripe.paymentIntents.retrieve(stripeId, {
            expand: ['latest_charge'],
        });
        const card = (_b = (_a = pi === null || pi === void 0 ? void 0 : pi.latest_charge) === null || _a === void 0 ? void 0 : _a.payment_method_details) === null || _b === void 0 ? void 0 : _b.card;
        if (card === null || card === void 0 ? void 0 : card.last4) {
            const brand = String(card.brand || 'card');
            const label = brand === 'amex' ? 'American Express' : brand.charAt(0).toUpperCase() + brand.slice(1);
            return `${label} ending ${card.last4}`;
        }
        const type = (_d = (_c = pi === null || pi === void 0 ? void 0 : pi.latest_charge) === null || _c === void 0 ? void 0 : _c.payment_method_details) === null || _d === void 0 ? void 0 : _d.type;
        return type ? String(type).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : null;
    }
    catch (_e) {
        return null;
    }
});
/** What the package held when it was bought, for the "What's included" card. */
const packageContents = (caregiverId, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { DownloadService } = require('../document/download.service');
        const [docs, signed] = yield Promise.all([
            DownloadService.getDownloadableDocuments(caregiverId, agencyId),
            DownloadService.getSignedDocuments(caregiverId, agencyId),
        ]);
        const credentials = docs.filter((d) => !d.isGchexs).length;
        const gchexs = docs.some((d) => d.isGchexs);
        return { credentials, signed: signed.length, gchexs };
    }
    catch (_a) {
        return null;
    }
});
const agencyName = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId }).select('companyName firstName lastName');
    return {
        company: ((_a = info === null || info === void 0 ? void 0 : info.companyName) === null || _a === void 0 ? void 0 : _a.trim()) ||
            `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() ||
            'Your agency',
        first: ((_b = info === null || info === void 0 ? void 0 : info.firstName) === null || _b === void 0 ? void 0 : _b.trim()) || 'there',
    };
});
const caregiverLabel = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const [info, prof] = yield Promise.all([
        personal_info_model_1.PersonalInfo.findOne({ user: caregiverId }).select('firstName lastName'),
        professional_info_model_1.ProfessionalInfo.findOne({ user: caregiverId }).select('role'),
    ]);
    const name = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() || 'Caregiver';
    return { name, role: (prof === null || prof === void 0 ? void 0 : prof.role) || null };
});
/**
 * Render the receipt for a paid transaction, and fill its receipt fields.
 *
 * Layout and copy follow Faisal's A11 frame (payment receipt). The Stripe
 * transaction ID row is kept on top of the design because SCRUM-142 requires
 * it for traceability.
 */
const buildReceipt = (t, email) => __awaiter(void 0, void 0, void 0, function* () {
    const [agency, caregiver, stripeId, contents] = yield Promise.all([
        agencyName(String(t.agency)),
        caregiverLabel(String(t.caregiver)),
        resolveStripeTransactionId(t),
        packageContents(String(t.caregiver), String(t.agency)),
    ]);
    const method = yield resolvePaymentMethod(stripeId);
    const number = t.receiptNumber || (0, exports.receiptNumberFor)(t);
    const paidAt = t.paidAt || t.updatedAt || new Date();
    const first = caregiver.name.split(/\s+/)[0] || caregiver.name;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const included = contents
        ? [
            // SCRUM-196: legal counsel set "confirmed" as the platform word; "verified"
            // carries a claim we do not make.
            contents.credentials > 0 ? plural(contents.credentials, 'confirmed credential') : '',
            contents.gchexs ? 'GCHEXS confirmation' : '',
            contents.signed > 0 ? plural(contents.signed, 'signed document') : '',
        ]
            .filter(Boolean)
            .join(' + ')
        : '';
    const html = (0, email_layout_1.renderAlertEmail)({
        emblem: 'emblem-complete.png',
        eyebrow: 'PAYMENT RECEIPT',
        accent: email_layout_1.EMAIL_COLORS.green,
        heading: `Payment confirmed — ${first}'s package is ready`,
        // SCRUM-197: the greeting took the person's FIRST NAME from their profile,
        // so an account whose first name happens to be "Agency" was greeted
        // "Hi Agency" — which read as a broken placeholder on a receipt, at the
        // moment the agency had just paid. It is the business name now, and a
        // plain "Hi," when no business name is on file.
        greetingName: agency.company === 'Your agency' ? '' : (0, email_layout_1.escapeHtml)(agency.company),
        // SCRUM-194: "re-downloads are always free" promised permanent access, which
        // is what the ticket removes. The 30-day window is stated instead, together
        // with the half the agency would otherwise not know: anything the caregiver
        // updates inside the window is theirs too.
        intro: `your payment went through and ${(0, email_layout_1.escapeHtml)(caregiver.name)}'s credential package is now unlocked. You have ${payment_service_1.ACCESS_WINDOW_DAYS} days of access from today, and that includes any credential ${(0, email_layout_1.escapeHtml)(caregiver.name)} updates in that time.`,
        detailRowsHtml: (0, email_layout_1.emailDetailRow)('AMOUNT PAID', money(t.priceChargedCents, t.currency), 0) +
            (0, email_layout_1.emailDetailRow)('DATE', (0, email_layout_1.escapeHtml)(formatDay(paidAt)), 14) +
            (0, email_layout_1.emailDetailRow)('PAYMENT METHOD', method ? (0, email_layout_1.escapeHtml)(method) : stripeId ? 'Card' : 'Test payment &mdash; no card charged', 14) +
            (0, email_layout_1.emailDetailRow)('RECEIPT NUMBER', (0, email_layout_1.escapeHtml)(number), 14) +
            (0, email_layout_1.emailDetailRow)('STRIPE TRANSACTION ID', stripeId
                ? `<span style="font-family:Consolas,Menlo,monospace;font-size:13px">${(0, email_layout_1.escapeHtml)(stripeId)}</span>`
                : 'Test payment &mdash; no Stripe charge', 14),
        extraHtml: included ? (0, email_layout_1.emailTintCard)('WHAT&rsquo;S INCLUDED', (0, email_layout_1.escapeHtml)(included)) : '',
        cta: 'Download package',
        ctaHref: `${(0, email_layout_1.emailAppUrl)()}/agency/caregivers/${String(t.caregiver)}`,
        note: `Processed securely by Stripe on behalf of Wevoro. Keep this email as your receipt.${email ? ` Billed to ${(0, email_layout_1.escapeHtml)(agency.company)} (${(0, email_layout_1.escapeHtml)(email)}).` : ''}`,
        footerLine: 'You&rsquo;re receiving this receipt because your agency bought a credential package on WeVoro.',
    });
    t.receiptNumber = number;
    t.stripeTransactionId = stripeId || undefined;
    t.receiptHtml = html;
    return { number, html, stripeId, caregiverName: caregiver.name };
});
/**
 * Email the receipt, once. Called by markPaid on every path that marks a
 * transaction paid (webhook, server-side confirm, the QA simulator).
 */
const sendPacketReceipt = (transactionId) => __awaiter(void 0, void 0, void 0, function* () {
    const t = yield pricing_model_1.PacketTransaction.findById(transactionId);
    if (!t || t.status !== 'paid' || t.receiptEmailSentAt)
        return;
    const agencyUser = yield user_model_1.User.findById(t.agency).select('email');
    const email = (agencyUser === null || agencyUser === void 0 ? void 0 : agencyUser.email) || null;
    const { number, html, caregiverName } = yield buildReceipt(t, email);
    if (!email) {
        t.receiptError = 'No email address on the agency account';
        yield t.save();
        return;
    }
    try {
        yield (0, sendMail_1.sendEmail)(email, `Payment confirmed — ${caregiverName}'s package is ready (receipt ${number})`, html);
        t.receiptEmailSentAt = new Date();
        t.receiptSentTo = email;
        t.receiptError = undefined;
        console.log(`[payment] receipt ${number} emailed to ${email}`);
    }
    catch (err) {
        // Stored anyway, so the receipt is still viewable and the failure visible.
        t.receiptError = (err === null || err === void 0 ? void 0 : err.message) || 'Email failed';
        console.error(`[payment] receipt ${number} email FAILED:`, err === null || err === void 0 ? void 0 : err.message);
    }
    yield t.save();
});
exports.sendPacketReceipt = sendPacketReceipt;
/**
 * The stored receipt, for the agency that paid or for an admin. A payment made
 * before receipts existed gets one built (and stored) on first view; it is not
 * emailed retroactively.
 */
const getReceipt = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const t = yield pricing_model_1.PacketTransaction.findById(params.transactionId).catch(() => null);
    const isAdmin = ['admin', 'super_admin'].includes(params.role);
    if (!t || (!isAdmin && String(t.agency) !== String(params.userId))) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Receipt not found');
    }
    if (t.status !== 'paid') {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'This transaction has not been paid');
    }
    if (!t.receiptHtml) {
        const agencyUser = yield user_model_1.User.findById(t.agency).select('email');
        yield buildReceipt(t, (agencyUser === null || agencyUser === void 0 ? void 0 : agencyUser.email) || null);
        yield t.save();
    }
    return {
        html: t.receiptHtml,
        receiptNumber: t.receiptNumber,
        stripeTransactionId: t.stripeTransactionId || null,
        receiptEmailSentAt: t.receiptEmailSentAt || null,
        receiptSentTo: t.receiptSentTo || null,
    };
});
exports.getReceipt = getReceipt;
