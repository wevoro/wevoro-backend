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
Object.defineProperty(exports, "__esModule", { value: true });
exports.withPaywalledUrls = exports.redactSensitiveDocuments = exports.filterVisibleDocuments = exports.isAgencyConfirmed = exports.isSensitiveCredential = void 0;
const user_model_1 = require("../user/user.model");
const credentials_1 = require("../../../constants/credentials");
/**
 * SCRUM-99 / SCRUM-100 — credential tier gate.
 *
 * Sensitive credentials stay hidden from an agency until that agency is
 * CONFIRMED (verified via the Georgia Home Care Provider Registry + Secretary
 * of State). Per the July-23 legal call (Lucas): health results + background
 * checks are sensitive; professional qualifications + license are general.
 *
 * The mapping lives here so it can change in one place.
 *
 * SCRUM-177 restates the two tiers, and adds supporting documents to them:
 *   GENERAL   = [Role] Certificate, CPR Test, Driver's License, Auto Insurance,
 *               and Non-Medical supporting documents
 *   SENSITIVE = TB Test, GCHEXS (background check), and any supporting upload
 *               whose Category is Medical Document
 */
/** Always sensitive, whatever category the upload carried. */
const SENSITIVE_TYPES = new Set(['tb_tests', 'gchexs']);
/**
 * SCRUM-177: the required credentials that stay GENERAL — the five required
 * keys minus TB Test. Derived from REQUIRED_CREDENTIAL_KEYS so it cannot drift
 * from the required list the rest of the app reads.
 */
const GENERAL_REQUIRED_TYPES = new Set(credentials_1.REQUIRED_CREDENTIAL_KEYS.filter((key) => !SENSITIVE_TYPES.has(key)));
/** The category the upload form writes for a Medical Document. */
const MEDICAL_CATEGORY = 'medical';
/**
 * SCRUM-177 — which tier is this document in?
 *
 * PRECEDENCE MATTERS, and the rule is deliberately NOT "category === medical":
 *  1. TB Test and GCHEXS are sensitive, whatever category is on the row.
 *  2. Then the four general REQUIRED credentials are general, whatever category
 *     is on the row. CPR Test is stored as a Medical category in this product
 *     (SCRUM-44 pre-fills medical for it), yet SCRUM-177 lists CPR explicitly
 *     in the general tier — so the required list wins over the category, or
 *     every caregiver's CPR Test would disappear behind the gate.
 *  3. Only then does the category decide: a NON-required (supporting) document
 *     filed as a Medical Document is sensitive.
 *  4. Anything else — a Non-Medical supporting document — is general.
 *
 * Takes the document rather than the type alone, because from step 3 on the
 * answer depends on the category too.
 */
const isSensitiveCredential = (doc) => {
    const documentType = (doc === null || doc === void 0 ? void 0 : doc.documentType) ? String(doc.documentType) : '';
    if (SENSITIVE_TYPES.has(documentType))
        return true;
    if (GENERAL_REQUIRED_TYPES.has(documentType))
        return false;
    return String((doc === null || doc === void 0 ? void 0 : doc.category) || '').toLowerCase() === MEDICAL_CATEGORY;
};
exports.isSensitiveCredential = isSensitiveCredential;
/**
 * An agency is "Confirmed" (may see sensitive credentials) when its account
 * status is 'approved'. 'pending' = Non-confirmed, 'in-review' = Pending
 * Verification — neither can see the sensitive tier.
 */
const isAgencyConfirmed = (status) => status === 'approved';
exports.isAgencyConfirmed = isAgencyConfirmed;
/**
 * Filter a caregiver's documents to what a requester may see.
 *
 * Rules:
 *  - The caregiver viewing their OWN documents sees everything.
 *  - An admin/super_admin sees everything.
 *  - An agency sees general-tier credentials always, and sensitive-tier only
 *    once the agency is Confirmed.
 *
 * NOTE: the per-document public/private privacy layer is deliberately not
 * enforced here (it never was — enforcing it would have hidden general
 * credentials the share flow is meant to show). The tier gate above is the
 * legally-required change; the privacy layer has its own request/grant flow
 * (PrivateAccess).
 *
 * SCRUM-177: the caregiver no longer chooses privacy at all, and every document
 * is now stored 'public' (document.service#uploadDocument). There was no gate
 * here to remove — this note is the whole of it — so nothing was deleted; the
 * flag simply has no say in visibility, and the tier gate below is the only
 * rule.
 *
 * @param docs         the caregiver's documents (may include a virtual gchexs doc)
 * @param requesterId  whoever is asking (undefined => treat as un-confirmed)
 * @param caregiverId  the owner of the documents
 */
const filterVisibleDocuments = (docs, requesterId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // Owner sees everything.
    if (requesterId && requesterId.toString() === caregiverId.toString()) {
        return docs;
    }
    let confirmed = false;
    if (requesterId) {
        const requester = yield user_model_1.User.findById(requesterId, { status: 1, role: 1 });
        // Admins see everything.
        if (requester &&
            (requester.role === 'admin' || requester.role === 'super_admin')) {
            return docs;
        }
        confirmed = (0, exports.isAgencyConfirmed)(requester === null || requester === void 0 ? void 0 : requester.status);
    }
    // Tier gate: hide sensitive credentials until the agency is Confirmed.
    // SCRUM-177: the whole row goes in, not just its type — a supporting
    // document's tier is decided by its category.
    return docs.filter((doc) => !(0, exports.isSensitiveCredential)(doc) || confirmed);
});
exports.filterVisibleDocuments = filterVisibleDocuments;
/**
 * SCRUM-129 — redact the sensitive tier instead of deleting it.
 *
 * filterVisibleDocuments drops the whole row, and the credential card reads a
 * missing row as "Not Uploaded". So a caregiver who HAD uploaded their TB test
 * was shown to a non-Confirmed agency as if they had never uploaded it, which
 * is both wrong and worse for the caregiver. SCRUM-63 Scenario 3 requires the
 * card to render with the real review state.
 *
 * The state of a sensitive credential is not itself the sensitive thing: the
 * file and its extracted metadata are. Keep the row's identity and review
 * state, strip everything else, and mark it restricted so the UI can say why
 * it cannot be opened. Dropping the row stays the behaviour everywhere else.
 */
const redactSensitiveDocuments = (docs, requesterId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const visible = yield (0, exports.filterVisibleDocuments)(docs, requesterId, caregiverId);
    if (visible.length === docs.length)
        return visible;
    const allowed = new Set(visible.map((d) => String(d._id)));
    return docs.map((d) => {
        if (allowed.has(String(d._id)))
            return d;
        const plain = typeof (d === null || d === void 0 ? void 0 : d.toObject) === 'function' ? d.toObject() : d;
        return {
            _id: plain._id,
            user: plain.user,
            documentType: plain.documentType,
            title: plain.title,
            reviewStatus: plain.reviewStatus,
            createdAt: plain.createdAt,
            updatedAt: plain.updatedAt,
            url: null,
            locked: true,
            restricted: true,
            restrictedReason: 'Your agency must be confirmed by WeVoro before this credential can be opened.',
        };
    });
});
exports.redactSensitiveDocuments = redactSensitiveDocuments;
/**
 * SCRUM-119 — the paywall, applied to the credential-read paths.
 *
 * The url IS the file: the CDN links are unsigned and world-readable, so any
 * response carrying one has already handed over the bytes. getPacketManifest
 * in download.service.ts withholds exactly this one field until the packet is
 * paid for ("the agency can see exactly what they are buying, and cannot reach
 * the bytes until they have") — but /document?userId= and the credential-status
 * read returned the raw url, so the free "View Credential" button next to the
 * paid "Download Credential Package" button served the same file.
 *
 * Metadata stays free; bytes do not. Owner and admin are unaffected.
 */
const withPaywalledUrls = (docs, requesterId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    if (requesterId && requesterId.toString() === caregiverId.toString()) {
        return docs;
    }
    if (requesterId) {
        const requester = yield user_model_1.User.findById(requesterId, { role: 1 });
        if ((requester === null || requester === void 0 ? void 0 : requester.role) === 'admin' || (requester === null || requester === void 0 ? void 0 : requester.role) === 'super_admin') {
            return docs;
        }
        // Required lazily, exactly as requirePacketEntitlement does, to keep the
        // Stripe SDK out of the cold start of routes that never touch payments.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { hasEntitlement } = require('../payment/payment.service');
        if (yield hasEntitlement(requesterId, caregiverId)) {
            // SCRUM-67 / SCRUM-131: paying buys the credential package, not every
            // file the caregiver has ever uploaded. Handing back every url here let a
            // paid agency fetch what the package deliberately withholds — a Pending
            // GCHEXS (Priya Nair, Lena Thompson on QA), credentials still waiting for
            // review, a resume — straight from the CDN, whatever the download routes
            // refused. Keep the link only on rows that are in the package; the rest
            // stay behind the free view route like any unpaid row. Required lazily
            // for the same cold-start reason, and to avoid a cycle with download.service.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { DownloadService } = require('./download.service');
            const packet = yield DownloadService.getConfirmedCredentials(caregiverId);
            const inPacket = new Set(packet.map((d) => String(d._id)));
            return docs.map((d) => (inPacket.has(String(d === null || d === void 0 ? void 0 : d._id)) ? d : lockRow(d)));
        }
    }
    return docs.map(lockRow);
});
exports.withPaywalledUrls = withPaywalledUrls;
/** A row with its file link withheld. */
const lockRow = (d) => {
    const plain = typeof (d === null || d === void 0 ? void 0 : d.toObject) === 'function' ? d.toObject() : d;
    return Object.assign(Object.assign({}, plain), { url: null, locked: true, 
        // SCRUM-130: viewing is free, downloading is not. The raw CDN link still
        // never leaves the server, but the client needs to know a file exists so
        // it can offer the authenticated view route instead of a padlock.
        hasFile: !!plain.url });
};
