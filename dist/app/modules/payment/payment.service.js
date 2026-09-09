"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.getMyTransactions = exports.markDelivered = exports.simulate = exports.confirmFromStripe = exports.handleWebhook = exports.markFailed = exports.markPaid = exports.createCheckout = exports.getPacketStatus = exports.hasEntitlement = exports.findEntitlement = exports.isStripeConfigured = void 0;
const http_status_1 = __importDefault(require("http-status"));
const stripe_1 = __importDefault(require("stripe"));
const config_1 = __importDefault(require("../../../config"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const pricing_model_1 = require("../pricing/pricing.model");
const pricing_service_1 = require("../pricing/pricing.service");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const documents_model_1 = require("../document/documents.model");
const user_model_1 = require("../user/user.model");
const user_1 = require("../../../enums/user");
/**
 * SCRUM-115: Stripe payments for credential packets.
 *
 * Three rules drive the whole module:
 *
 *  1. Delivery is gated on the WEBHOOK, never on the client saying it paid.
 *     A browser can claim anything; only Stripe's signed event is evidence.
 *  2. Entitlement is per (agency, caregiver) pair and permanent. A second
 *     download must never create a second charge.
 *  3. price_charged is locked onto the transaction when the intent is created
 *     and never recalculated, so a later price change cannot rewrite history.
 *
 * Payment is deliberately independent of e-signature status (AC #6) — nothing
 * here reads or waits on a signature packet.
 */
const stripeClient = () => {
    const key = config_1.default.stripe.secret_key;
    if (!key)
        return null;
    return new stripe_1.default(key, { apiVersion: '2025-10-29.clover' });
};
/**
 * True when a real Stripe charge can be made. When false the module either
 * refuses (production) or simulates (QA with PAYMENTS_TEST_MODE=true).
 */
const isStripeConfigured = () => !!config_1.default.stripe.secret_key;
exports.isStripeConfigured = isStripeConfigured;
/**
 * The simulated path exists so QA can exercise every state before credentials
 * arrive. It requires BOTH the explicit opt-in AND no real Stripe key, so
 * configuring Stripe automatically disables it.
 */
const isTestMode = () => config_1.default.payments_test_mode && !(0, exports.isStripeConfigured)();
const displayName = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName lastName companyName');
    const person = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim();
    return (info === null || info === void 0 ? void 0 : info.companyName) || person || 'A WeVoro user';
});
/** The paid entitlement for this pair, if one exists. */
const findEntitlement = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    return pricing_model_1.PacketTransaction.findOne({
        agency: agencyId,
        caregiver: caregiverId,
        status: 'paid',
    });
});
exports.findEntitlement = findEntitlement;
/** Has this agency already paid for this caregiver's packet? */
const hasEntitlement = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () { return !!(yield (0, exports.findEntitlement)(agencyId, caregiverId)); });
exports.hasEntitlement = hasEntitlement;
/**
 * What the agency should see before paying: the price, whether they already own
 * this packet, and how many files it holds.
 *
 * Never gated on e-signature — a caregiver mid-signature must not block a sale.
 */
const getPacketStatus = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { agencyId, caregiverId } = params;
    const [priceCents, entitlement, caregiverName, info, prof] = yield Promise.all([
        (0, pricing_service_1.getCurrentPriceCents)(),
        (0, exports.findEntitlement)(agencyId, caregiverId),
        displayName(caregiverId),
        // The payment screen shows the caregiver's photo, role and city so the
        // agency can see who they are paying for. Sourced here rather than passed
        // in by each caller, so every surface that opens the gate shows the same
        // thing instead of a half-filled card.
        personal_info_model_1.PersonalInfo.findOne({ user: caregiverId }).select('image address'),
        professional_info_model_1.ProfessionalInfo.findOne({ user: caregiverId }).select('role'),
    ]);
    // The design shows "{name} · N files" under the packet line, so the agency
    // knows how much they are getting before paying. Counted here rather than
    // left to the manifest call, because the gate can be opened without the
    // documents modal ever being loaded.
    //
    // SCRUM-99: counted from the same visible set the manifest shows and the
    // download actually releases. A raw count ignored the sensitive-credential
    // tier gate, so an un-Confirmed agency was quoted files it would never
    // receive — "4 files" on the buy screen, 2 in the delivered package.
    const allDocs = yield documents_model_1.Documents.find({
        user: caregiverId,
        url: { $exists: true, $nin: [null, ''] },
    });
    const { filterVisibleDocuments } = yield Promise.resolve().then(() => __importStar(require('../document/credential-visibility')));
    const fileCount = (yield filterVisibleDocuments(allDocs, agencyId, caregiverId))
        .length;
    const city = (_a = info === null || info === void 0 ? void 0 : info.address) === null || _a === void 0 ? void 0 : _a.city;
    const state = (_b = info === null || info === void 0 ? void 0 : info.address) === null || _b === void 0 ? void 0 : _b.state;
    return {
        caregiverId,
        caregiverName,
        caregiverImage: (info === null || info === void 0 ? void 0 : info.image) || null,
        caregiverRole: (prof === null || prof === void 0 ? void 0 : prof.role) || null,
        caregiverLocation: [city, state].filter(Boolean).join(', ') || null,
        fileCount,
        // A paid packet keeps the price it was bought at, not today's price.
        priceCents: entitlement ? entitlement.priceChargedCents : priceCents,
        currency: 'usd',
        paid: !!entitlement,
        paidAt: (_c = entitlement === null || entitlement === void 0 ? void 0 : entitlement.paidAt) !== null && _c !== void 0 ? _c : null,
        transactionId: (_d = entitlement === null || entitlement === void 0 ? void 0 : entitlement._id) !== null && _d !== void 0 ? _d : null,
        stripeConfigured: (0, exports.isStripeConfigured)(),
        testMode: isTestMode(),
    };
});
exports.getPacketStatus = getPacketStatus;
/**
 * Start (or resume) a purchase.
 *
 * Idempotent in three ways, which together satisfy "never double-charge":
 *  - an existing PAID row short-circuits and charges nothing;
 *  - an existing PENDING row reuses its PaymentIntent rather than creating a
 *    second one, so a refreshed browser does not open two charges;
 *  - the price is read once and frozen onto the row.
 */
const createCheckout = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { agencyId, caregiverId } = params;
    // A packet is a caregiver's credentials. Anything else — another agency, an
    // admin — is not a purchasable product: buying one wrote a nonsense row into
    // the founder's ledger and granted a permanent download entitlement over an
    // account that sells nothing. The message is deliberately unchanged so the
    // endpoint does not confirm which ids are real accounts.
    const caregiver = yield user_model_1.User.findById(caregiverId).select('_id role');
    if (!caregiver || caregiver.role !== user_1.ENUM_USER_ROLE.PRO) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Caregiver not found');
    }
    // Rule 2: already owned — no Stripe call, no new transaction.
    const owned = yield (0, exports.findEntitlement)(agencyId, caregiverId);
    if (owned) {
        return {
            alreadyPaid: true,
            transactionId: String(owned._id),
            priceCents: owned.priceChargedCents,
            currency: owned.currency,
            clientSecret: null,
            testMode: isTestMode(),
        };
    }
    const priceCents = yield (0, pricing_service_1.getCurrentPriceCents)();
    // Reuse an unfinished attempt rather than stacking intents.
    let transaction = yield pricing_model_1.PacketTransaction.findOne({
        agency: agencyId,
        caregiver: caregiverId,
        status: { $in: ['pending', 'failed'] },
    }).sort({ createdAt: -1 });
    if (!transaction) {
        transaction = yield pricing_model_1.PacketTransaction.create({
            agency: agencyId,
            caregiver: caregiverId,
            // Rule 3: locked here, never recomputed.
            priceChargedCents: priceCents,
            currency: 'usd',
            status: 'pending',
            transactionDate: new Date(),
        });
    }
    else if (transaction.priceChargedCents !== priceCents) {
        // "Locked, never recomputed" is right for a transaction that was PAID —
        // the ledger must not rewrite what an agency was actually charged. It is
        // wrong for one that never completed. An abandoned attempt from before a
        // price change kept quoting the old amount forever: the admin page said
        // $49.99 while this gate charged $60.00, and an agency sitting on a stale
        // pending row could also keep buying at a price the founder had already
        // raised. Nothing was charged for a pending/failed row, so re-price it to
        // what the packet costs today. Paid rows never reach here — they return
        // above through `owned`.
        transaction.priceChargedCents = priceCents;
        // The Stripe intent below carries an amount. Drop the stale one so a new
        // intent is minted for the new price instead of confirming the old total.
        transaction.stripePaymentIntentId = undefined;
        yield transaction.save();
    }
    if (isTestMode()) {
        // No Stripe. The client drives the state machine through /simulate.
        transaction.status = 'pending';
        transaction.failureMessage = undefined;
        yield transaction.save();
        return {
            alreadyPaid: false,
            transactionId: String(transaction._id),
            priceCents: transaction.priceChargedCents,
            currency: transaction.currency,
            clientSecret: null,
            testMode: true,
        };
    }
    const stripe = stripeClient();
    if (!stripe) {
        throw new ApiError_1.default(http_status_1.default.SERVICE_UNAVAILABLE, 'Payments are not configured yet. Please try again later.');
    }
    // Reuse the existing intent when it is still usable, so a retry after a
    // decline does not create a second charge object.
    let intent = null;
    if (transaction.stripePaymentIntentId) {
        try {
            const existing = yield stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);
            if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
                intent = existing;
            }
        }
        catch (_a) {
            // Intent vanished or belongs to another key — fall through and make one.
        }
    }
    if (!intent) {
        intent = yield stripe.paymentIntents.create({
            amount: transaction.priceChargedCents,
            currency: transaction.currency || 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: {
                transactionId: String(transaction._id),
                agencyId: String(agencyId),
                caregiverId: String(caregiverId),
                product: 'credential_packet',
            },
        }, 
        // Stripe-side idempotency: the same transaction never yields two charges
        // even if this endpoint is called twice concurrently. The price is part
        // of the key because Stripe rejects a reused key whose parameters have
        // changed — after a re-price above, the same transaction legitimately
        // needs a second intent for the new amount.
        { idempotencyKey: `packet_${transaction._id}_${transaction.priceChargedCents}` });
        transaction.stripePaymentIntentId = intent.id;
        yield transaction.save();
    }
    return {
        alreadyPaid: false,
        transactionId: String(transaction._id),
        priceCents: transaction.priceChargedCents,
        currency: transaction.currency,
        clientSecret: intent.client_secret,
        publishableKey: config_1.default.stripe.publishable_key,
        testMode: false,
    };
});
exports.createCheckout = createCheckout;
/**
 * Mark a transaction paid. Called ONLY from the webhook (or the QA simulator),
 * never from a client claim.
 *
 * Idempotent against Stripe's at-least-once delivery: an event id already
 * recorded is ignored, and an already-paid row is left untouched.
 */
const markPaid = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { transactionId, eventId, paymentIntentId } = params;
    const transaction = yield pricing_model_1.PacketTransaction.findById(transactionId);
    if (!transaction)
        return null;
    if (eventId && (transaction.stripeEventIds || []).includes(eventId)) {
        return transaction; // already processed this exact event
    }
    if (transaction.status !== 'paid') {
        transaction.status = 'paid';
        transaction.paidAt = new Date();
        transaction.failureMessage = undefined;
    }
    if (paymentIntentId)
        transaction.stripePaymentIntentId = paymentIntentId;
    if (eventId)
        transaction.stripeEventIds = [...(transaction.stripeEventIds || []), eventId];
    yield transaction.save();
    return transaction;
});
exports.markPaid = markPaid;
/** Record a decline. No entitlement is granted and no file is released. */
const markFailed = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { transactionId, eventId, message } = params;
    const transaction = yield pricing_model_1.PacketTransaction.findById(transactionId);
    if (!transaction)
        return null;
    if (eventId && (transaction.stripeEventIds || []).includes(eventId)) {
        return transaction;
    }
    // A paid row is never downgraded by a late failure event.
    if (transaction.status !== 'paid') {
        transaction.status = 'failed';
        transaction.failureMessage = message || 'Payment failed';
    }
    if (eventId)
        transaction.stripeEventIds = [...(transaction.stripeEventIds || []), eventId];
    yield transaction.save();
    return transaction;
});
exports.markFailed = markFailed;
/**
 * Verify and handle a Stripe webhook. The raw body is required — a parsed body
 * cannot be signature-checked.
 */
const handleWebhook = (rawBody, signature) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const stripe = stripeClient();
    const secret = config_1.default.stripe.webhook_secret;
    if (!stripe || !secret) {
        throw new ApiError_1.default(http_status_1.default.SERVICE_UNAVAILABLE, 'Stripe is not configured');
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    }
    catch (err) {
        // An unverified payload is not evidence of anything.
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Webhook signature failed: ${err.message}`);
    }
    const intent = event.data.object;
    const transactionId = (_a = intent === null || intent === void 0 ? void 0 : intent.metadata) === null || _a === void 0 ? void 0 : _a.transactionId;
    if (transactionId) {
        if (event.type === 'payment_intent.succeeded') {
            yield (0, exports.markPaid)({ transactionId, eventId: event.id, paymentIntentId: intent.id });
        }
        else if (event.type === 'payment_intent.payment_failed') {
            yield (0, exports.markFailed)({
                transactionId,
                eventId: event.id,
                message: ((_b = intent.last_payment_error) === null || _b === void 0 ? void 0 : _b.message) || 'Card declined',
            });
        }
    }
    return { received: true, type: event.type };
});
exports.handleWebhook = handleWebhook;
/**
 * Ask Stripe directly what happened to a transaction's PaymentIntent.
 *
 * This is NOT the client telling us it paid — it is our server asking Stripe,
 * which is the same authority the webhook speaks with. It exists for two
 * reasons: the webhook secret may not be configured yet, and in production
 * webhooks are occasionally delayed or dropped, which would otherwise strand a
 * paying agency on the processing screen.
 *
 * Safe to call repeatedly: markPaid and markFailed are both idempotent.
 */
const confirmFromStripe = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const transaction = yield pricing_model_1.PacketTransaction.findOne({
        _id: params.transactionId,
        agency: params.agencyId,
    });
    if (!transaction)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Transaction not found');
    if (transaction.status === 'paid')
        return transaction;
    const stripe = stripeClient();
    if (!stripe || !transaction.stripePaymentIntentId)
        return transaction;
    const intent = yield stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);
    if (intent.status === 'succeeded') {
        return (0, exports.markPaid)({
            transactionId: String(transaction._id),
            eventId: `confirm_${intent.id}`,
            paymentIntentId: intent.id,
        });
    }
    if (intent.status === 'canceled' || intent.last_payment_error) {
        return (0, exports.markFailed)({
            transactionId: String(transaction._id),
            eventId: `confirm_${intent.id}_${intent.status}`,
            message: ((_a = intent.last_payment_error) === null || _a === void 0 ? void 0 : _a.message) || 'Card declined',
        });
    }
    // Still in flight — leave it pending and let the caller poll again.
    return transaction;
});
exports.confirmFromStripe = confirmFromStripe;
/**
 * QA-only state driver. Refuses outright once Stripe is configured, so it
 * cannot be used to bypass a real payment.
 */
const simulate = (params) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isTestMode()) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Simulation is disabled — payments run through Stripe');
    }
    const transaction = yield pricing_model_1.PacketTransaction.findOne({
        _id: params.transactionId,
        agency: params.agencyId,
    });
    if (!transaction)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Transaction not found');
    if (params.outcome === 'succeed') {
        return (0, exports.markPaid)({ transactionId: params.transactionId, eventId: `sim_${Date.now()}` });
    }
    return (0, exports.markFailed)({
        transactionId: params.transactionId,
        eventId: `sim_${Date.now()}`,
        message: 'Card declined — insufficient funds (no charge made)',
    });
});
exports.simulate = simulate;
/** Record that the packet actually reached the agency. */
const markDelivered = (transactionId) => __awaiter(void 0, void 0, void 0, function* () {
    yield pricing_model_1.PacketTransaction.findByIdAndUpdate(transactionId, {
        $set: { deliveredAt: new Date() },
    });
});
exports.markDelivered = markDelivered;
/** The agency's own purchase history, for receipts. */
const getMyTransactions = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    const rows = yield pricing_model_1.PacketTransaction.find({ agency: agencyId })
        .sort({ transactionDate: -1 })
        .lean();
    return Promise.all(rows.map((t) => __awaiter(void 0, void 0, void 0, function* () {
        return ({
            _id: t._id,
            caregiverName: yield displayName(String(t.caregiver)),
            caregiverId: t.caregiver,
            priceChargedCents: t.priceChargedCents,
            currency: t.currency,
            status: t.status,
            transactionDate: t.transactionDate,
            paidAt: t.paidAt,
        });
    })));
});
exports.getMyTransactions = getMyTransactions;
