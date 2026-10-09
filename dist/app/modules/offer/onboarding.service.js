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
exports.markOfferSubmitted = exports.onboardCaregiver = exports.getOnboardSummary = exports.isAgencyAccountComplete = exports.hasCaregiverSubmitted = exports.getOnboardStatus = exports.getOnboardStatuses = exports.resolveSubmittedAt = exports.ONBOARD_SOURCE = void 0;
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = __importDefault(require("mongoose"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const user_1 = require("../../../enums/user");
const offer_model_1 = require("./offer.model");
const esign_model_1 = require("../esign/esign.model");
const notification_model_1 = require("../user/notification.model");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const user_model_1 = require("../user/user.model");
const RESPONDED = ['responded', 'accepted', 'onboarded'];
/**
 * SCRUM-141: the only offers that count toward a pair's onboard state. An
 * offer opened by the Onboard button carries this source; scheduling-era job
 * offers carry none. The caregiver's signature through Respond is the first of
 * two mandatory gates, and a job offer the caregiver accepted under the old
 * flow was never that — yet it used to read as 'submitted', so the agency
 * could pay for and download the package without Onboard → Respond ever
 * happening. Such a pair now reads 'none': the agency sees Onboard, and the
 * old offer can no longer trip onboardCaregiver's "already onboarded" guard.
 * A packet the agency already paid for is unaffected — the entitlement, not
 * the onboard state, decides "Download again".
 */
exports.ONBOARD_SOURCE = 'onboard';
/**
 * When an offer was submitted, if it has been.
 *
 * `submittedAt` is written from now on. Offers answered before it existed are
 * read from what they left behind: a completed packet, or a response with
 * nothing to sign. That fallback only serves the caregiver's own card (the
 * Submitted tab, via getOffers); it is never consent, because statusFor only
 * ever sees onboard offers.
 */
const resolveSubmittedAt = (offer, packet) => {
    if (offer === null || offer === void 0 ? void 0 : offer.submittedAt)
        return offer.submittedAt;
    // Onboard offers always record it, so a missing value means not submitted —
    // e.g. the packet failed to start and the caregiver still has to sign.
    if ((offer === null || offer === void 0 ? void 0 : offer.source) === exports.ONBOARD_SOURCE)
        return null;
    if (!RESPONDED.includes(offer === null || offer === void 0 ? void 0 : offer.status))
        return null;
    if (!packet)
        return offer.updatedAt || offer.createdAt || null;
    if (packet.status === 'completed')
        return packet.completedAt || packet.updatedAt || null;
    return null;
};
exports.resolveSubmittedAt = resolveSubmittedAt;
const statusFor = (offers, packets) => {
    const empty = {
        state: 'none',
        offerId: null,
        onboardedAt: null,
        submittedAt: null,
        signedCount: 0,
        totalToSign: 0,
    };
    if (!offers.length)
        return empty;
    const counts = (packet) => {
        var _a;
        const items = ((_a = packet === null || packet === void 0 ? void 0 : packet.items) !== null && _a !== void 0 ? _a : []).filter((i) => i.status !== 'outdated');
        return {
            signedCount: items.filter((i) => i.status === 'signed').length,
            totalToSign: items.length,
            documents: items.map((i) => ({ title: i.title, signed: i.status === 'signed' })),
        };
    };
    // Any submitted onboard offer is consent for the pair. Only onboard offers
    // reach here (see ONBOARD_SOURCE): a scheduling-era job offer the caregiver
    // answered is not a signature through Respond.
    for (const offer of offers) {
        const packet = packets.get(String(offer._id));
        const submittedAt = (0, exports.resolveSubmittedAt)(offer, packet);
        if (submittedAt) {
            return Object.assign({ state: 'submitted', offerId: String(offer._id), onboardedAt: offer.createdAt, submittedAt }, counts(packet));
        }
    }
    const latest = offers[0];
    const packet = packets.get(String(latest._id));
    const base = Object.assign({ offerId: String(latest._id), onboardedAt: latest.createdAt, submittedAt: null }, counts(packet));
    if (latest.status === 'rejected')
        return Object.assign({ state: 'declined' }, base);
    // SCRUM-170: each signature is saved as it is made so the caregiver can
    // resume later (SCRUM-118), and this used to pass that partial state on as
    // 'signing' with a live "N of M signed" count — the agency's Onboarding tab
    // and profile bar moved while the caregiver was still mid-flow. Nothing
    // reaches the agency until the caregiver has submitted the whole set: until
    // then the request simply reads "Awaiting signature", with nothing signed.
    if (packet && packet.status !== 'completed') {
        return Object.assign(Object.assign({ state: 'awaiting' }, base), { signedCount: 0, documents: base.documents.map((d) => (Object.assign(Object.assign({}, d), { signed: false }))) });
    }
    return Object.assign({ state: 'awaiting' }, base);
};
/** Onboard status for many caregivers at once (the agency's Offers tab). */
const getOnboardStatuses = (agencyId, caregiverIds) => __awaiter(void 0, void 0, void 0, function* () {
    // SCRUM-141: onboard offers only. Legacy job offers are left out here, at the
    // query, so every reader of the state — the profile, the Onboarding page,
    // checkout's consent check and onboardCaregiver's guard — follows one rule.
    const match = {
        partner: new mongoose_1.default.Types.ObjectId(agencyId),
        source: exports.ONBOARD_SOURCE,
    };
    if (caregiverIds) {
        match.pro = {
            $in: caregiverIds
                .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id))
                .map((id) => new mongoose_1.default.Types.ObjectId(id)),
        };
    }
    const offers = yield offer_model_1.Offer.find(match).sort({ createdAt: -1 }).lean();
    const packets = yield esign_model_1.SignaturePacket.find({
        offer: { $in: offers.map((o) => o._id) },
    }).lean();
    const packetByOffer = new Map();
    packets.forEach((p) => packetByOffer.set(String(p.offer), p));
    const byCaregiver = new Map();
    offers.forEach((o) => {
        const key = String(o.pro);
        if (!byCaregiver.has(key))
            byCaregiver.set(key, []);
        byCaregiver.get(key).push(o);
    });
    const result = new Map();
    byCaregiver.forEach((list, caregiverId) => result.set(caregiverId, statusFor(list, packetByOffer)));
    (caregiverIds !== null && caregiverIds !== void 0 ? caregiverIds : []).forEach((id) => {
        if (!result.has(id))
            result.set(id, statusFor([], packetByOffer));
    });
    return result;
});
exports.getOnboardStatuses = getOnboardStatuses;
const getOnboardStatus = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const map = yield (0, exports.getOnboardStatuses)(agencyId, [caregiverId]);
    return map.get(caregiverId);
});
exports.getOnboardStatus = getOnboardStatus;
/**
 * The signature gate. Payment and download both wait on this. Onboard offers
 * only (SCRUM-141): an offer accepted under the old scheduling flow is not the
 * caregiver's consent to release the package.
 */
const hasCaregiverSubmitted = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () { return (yield (0, exports.getOnboardStatus)(agencyId, caregiverId)).state === 'submitted'; });
exports.hasCaregiverSubmitted = hasCaregiverSubmitted;
const agencyDisplayName = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId }).select('companyName firstName lastName');
    return (((_a = info === null || info === void 0 ? void 0 : info.companyName) === null || _a === void 0 ? void 0 : _a.trim()) ||
        `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() ||
        'An agency');
});
/**
 * B5 (Faisal's agency flow): an agency cannot onboard before its own account
 * is complete — the same three fields the "Complete your agency account" form
 * collects, and the same test the login redirect uses.
 */
const isAgencyAccountComplete = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId }).select('companyName address');
    return !!((info === null || info === void 0 ? void 0 : info.companyName) && ((_a = info === null || info === void 0 ? void 0 : info.address) === null || _a === void 0 ? void 0 : _a.city) && ((_b = info === null || info === void 0 ? void 0 : info.address) === null || _b === void 0 ? void 0 : _b.state));
});
exports.isAgencyAccountComplete = isAgencyAccountComplete;
/**
 * What the profile's action bar needs: the onboard state, whether the agency
 * already owns the package, the price, and how many signing documents the
 * agency has for this caregiver's role (the SCRUM-117 "Continue anyway" prompt
 * appears when that is zero).
 */
const getOnboardSummary = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Lazy: keeps the Stripe SDK out of routes that never touch payments.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { findEntitlement } = require('../payment/payment.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCurrentPriceCents } = require('../pricing/pricing.service');
    const prof = yield professional_info_model_1.ProfessionalInfo.findOne({ user: caregiverId }).select('role');
    const role = (prof === null || prof === void 0 ? void 0 : prof.role) || 'CNA';
    const [status, entitlement, priceCents, signingDocuments, accountComplete] = yield Promise.all([
        (0, exports.getOnboardStatus)(agencyId, caregiverId),
        findEntitlement(agencyId, caregiverId),
        getCurrentPriceCents(),
        esign_model_1.SigningDocument.countDocuments({ agency: agencyId, role, status: 'active' }),
        (0, exports.isAgencyAccountComplete)(agencyId),
    ]);
    return Object.assign(Object.assign({}, status), { caregiverRole: role, signingDocuments, paid: !!entitlement, paidAt: (_a = entitlement === null || entitlement === void 0 ? void 0 : entitlement.paidAt) !== null && _a !== void 0 ? _a : null, priceCents: entitlement ? entitlement.priceChargedCents : priceCents, agencyAccountComplete: accountComplete });
});
exports.getOnboardSummary = getOnboardSummary;
/**
 * The Onboard button. Opens the offer that carries the agency's signing
 * documents to the caregiver and tells the caregiver about it.
 *
 * Idempotent: a pair that is already onboarded gets its current state back and
 * no second notification. A caregiver who declined is not asked again. A pair
 * whose only offers are scheduling-era job offers reads 'none' and is onboarded
 * like any other (SCRUM-141), instead of being stuck behind the old offer.
 */
const onboardCaregiver = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.default.Types.ObjectId.isValid(caregiverId)) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Caregiver not found');
    }
    const caregiver = yield user_model_1.User.findById(caregiverId).select('_id role');
    if (!caregiver || caregiver.role !== user_1.ENUM_USER_ROLE.PRO) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Caregiver not found');
    }
    /*
     * A pair that is already mid-flow gets its current state back and no second
     * request — asking twice while a caregiver is still deciding would send them
     * a duplicate.
     *
     * 'declined' is deliberately NOT in that set. It used to be, and a decline
     * was then final for ever: the caregiver's own copy is removed on decline
     * (SCRUM-55) and this guard stopped the agency ever asking again, so a tap on
     * "Not interested" cut the pair off permanently with no way back for either
     * side, or for an admin. Riad, 30 Sep: an agency may ask again as often as it
     * likes. A declined pair therefore falls through and a fresh request is
     * created, exactly as for a pair that has never been asked.
     */
    const current = yield (0, exports.getOnboardStatus)(agencyId, caregiverId);
    if (current.state !== 'none' && current.state !== 'declined') {
        return (0, exports.getOnboardSummary)(agencyId, caregiverId);
    }
    if (!(yield (0, exports.isAgencyAccountComplete)(agencyId))) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Complete your agency account before you onboard a caregiver.');
    }
    yield offer_model_1.Offer.create({
        partner: agencyId,
        pro: caregiverId,
        status: 'pending',
        source: exports.ONBOARD_SOURCE,
    });
    // Best-effort: a notification failure must not undo the onboarding.
    try {
        const agencyName = yield agencyDisplayName(agencyId);
        const prof = yield professional_info_model_1.ProfessionalInfo.findOne({ user: caregiverId }).select('role');
        const signCount = yield esign_model_1.SigningDocument.countDocuments({
            agency: agencyId,
            role: (prof === null || prof === void 0 ? void 0 : prof.role) || 'CNA',
            status: 'active',
        });
        yield notification_model_1.Notification.create({
            user: caregiverId,
            message: signCount > 0
                ? `<strong>${agencyName}</strong> wants to onboard you. Review and sign ${signCount} ${signCount === 1 ? 'document' : 'documents'} to respond.`
                : `<strong>${agencyName}</strong> wants to onboard you. Respond to share your confirmed credentials with them.`,
            type: 'onboard_request',
            ctaLink: '/caregiver/offers?tab=received',
            isRead: false,
        });
        const { sendOnboardRequestEmail } = yield Promise.resolve().then(() => __importStar(require('../esign/esign-email.service')));
        yield sendOnboardRequestEmail({ caregiverId, agencyName, signCount });
    }
    catch (err) {
        console.error('[onboard] could not notify the caregiver:', err);
    }
    return (0, exports.getOnboardSummary)(agencyId, caregiverId);
});
exports.onboardCaregiver = onboardCaregiver;
/**
 * Record that the caregiver finished responding, and tell the agency. Called
 * when a response needs no signing, and when the last document is signed.
 * Runs once per offer: the conditional update is the guard, so a retried
 * request never notifies twice.
 *
 * Onboard offers only (SCRUM-141). A caregiver can still answer a leftover
 * scheduling-era job offer, but that is not consent to release the package, so
 * the agency must not be told "their credential package is ready to download"
 * while its own screens still offer Onboard.
 *
 * SCRUM-191: never a declined offer. Declining does not close the signature
 * packet — it stays 'pending', so the reminder cron keeps asking for the
 * signatures and signItem would still take them. The last one landed here, and
 * submittedAt is the gate checkout and download wait on, so a decline could be
 * undone into 'submitted' and the package sold after all. The status test is
 * part of the same conditional update, so it is checked where it is written.
 */
const markOfferSubmitted = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const at = (_a = params.at) !== null && _a !== void 0 ? _a : new Date();
    const updated = yield offer_model_1.Offer.findOneAndUpdate({
        _id: params.offerId,
        source: exports.ONBOARD_SOURCE,
        submittedAt: null,
        status: { $ne: 'rejected' },
    }, { $set: { submittedAt: at } }, { new: true });
    if (!updated)
        return false;
    try {
        const [info, prof] = yield Promise.all([
            personal_info_model_1.PersonalInfo.findOne({ user: updated.pro }).select('firstName lastName'),
            professional_info_model_1.ProfessionalInfo.findOne({ user: updated.pro }).select('role'),
        ]);
        const caregiverName = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() || 'The caregiver';
        const role = (prof === null || prof === void 0 ? void 0 : prof.role) || 'CNA';
        const signed = (_b = params.signedCount) !== null && _b !== void 0 ? _b : 0;
        // A4 (Faisal's agency flow): "{Name} signed all 3 CNA documents."
        yield notification_model_1.Notification.create({
            user: updated.partner,
            message: 
            // SCRUM-188: "signed all 1 CNA document" does not read as English.
            // One document is "their CNA document"; more than one keeps the count.
            signed === 1
                ? `<strong>${caregiverName}</strong> signed their ${role} document.`
                : signed > 1
                    ? `<strong>${caregiverName}</strong> signed all ${signed} ${role} documents.`
                    : `<strong>${caregiverName}</strong> responded to your onboarding. Their credential package is ready to download.`,
            type: 'onboard_submitted',
            ctaLink: `/agency/caregivers/${updated.pro}`,
            isRead: false,
        });
        const { sendOnboardSubmittedEmail } = yield Promise.resolve().then(() => __importStar(require('../esign/esign-email.service')));
        yield sendOnboardSubmittedEmail({
            agencyId: String(updated.partner),
            caregiverId: String(updated.pro),
            caregiverName,
            caregiverRole: role,
            signedCount: signed,
            signedAt: at,
        });
    }
    catch (err) {
        console.error('[onboard] could not notify the agency:', err);
    }
    return true;
});
exports.markOfferSubmitted = markOfferSubmitted;
