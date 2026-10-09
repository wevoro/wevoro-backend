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
exports.DocumentService = void 0;
const documents_model_1 = require("./documents.model");
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const credential_notification_service_1 = require("../notification/credential-notification.service");
const credentials_1 = require("../../../constants/credentials");
const user_model_1 = require("../user/user.model");
const notification_model_1 = require("../user/notification.model");
// SCRUM-178: the credential audit trail, written from the service so the
// frontend needs no extra call.
const credential_audit_model_1 = require("./credential-audit.model");
/**
 * SCRUM-210: what to call a credential in a notification.
 *
 * The same five labels the rejection notice uses, with the PCA sign-off kept
 * apart from the certificate it shares a documentType with (SCRUM-165).
 */
const credentialLabel = (document) => __awaiter(void 0, void 0, void 0, function* () {
    if ((document === null || document === void 0 ? void 0 : document.documentType) === 'certifications') {
        if ((document === null || document === void 0 ? void 0 : document.part) === 'practical_signoff')
            return credentials_1.PCA_SIGNOFF_LABEL;
        try {
            const { ProfessionalInfo } = yield Promise.resolve().then(() => __importStar(require('../user/professional-info.model')));
            const prof = yield ProfessionalInfo.findOne({ user: document.user }).lean();
            return (prof === null || prof === void 0 ? void 0 : prof.role) === 'PCA' ? 'PCA Certificate' : 'CNA Certificate';
        }
        catch (_a) {
            return 'Certificate';
        }
    }
    const LABELS = {
        driver_license: "Driver's License",
        auto_insurance: 'Auto Insurance',
        cpr_test: 'CPR Test',
        tb_tests: 'TB Test',
        gchexs: 'GCHEXS background check',
    };
    return LABELS[document === null || document === void 0 ? void 0 : document.documentType] || (document === null || document === void 0 ? void 0 : document.title) || 'credential';
});
/**
 * SCRUM-210: tell the agencies inside their paid window that this caregiver
 * replaced a credential.
 *
 * The 9/30 sync made the window live (SCRUM-194), so the new file is already
 * theirs. Without this the change is only discoverable by opening the profile
 * and noticing, which is exactly the stale-credential risk the window was
 * meant to remove.
 *
 * Only packet credentials count. A new resume is not something an agency paid
 * for, so it does not raise a notice. Rows paid before the window shipped
 * carry no accessEndsAt and still have access, so they are notified too —
 * the same set findEntitlement serves.
 *
 * Best-effort: a failure here must never fail the caregiver's upload.
 */
const notifyAgenciesOfCredentialUpdate = (document) => __awaiter(void 0, void 0, void 0, function* () {
    const PACKET_TYPES = [...credentials_1.REQUIRED_CREDENTIAL_KEYS, 'gchexs'];
    if (!PACKET_TYPES.includes(String(document === null || document === void 0 ? void 0 : document.documentType)))
        return;
    const { PacketTransaction } = yield Promise.resolve().then(() => __importStar(require('../pricing/pricing.model')));
    const paid = yield PacketTransaction.find({
        caregiver: document.user,
        status: 'paid',
        $or: [
            { accessEndsAt: { $exists: false } },
            { accessEndsAt: { $gt: new Date() } },
        ],
    }).select('agency');
    if (!paid.length)
        return;
    const { PersonalInfo } = yield Promise.resolve().then(() => __importStar(require('../user/personal-info.model')));
    const info = yield PersonalInfo.findOne({ user: document.user }).lean();
    const caregiverName = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() || 'A caregiver';
    const label = yield credentialLabel(document);
    const seen = new Set();
    for (const row of paid) {
        const agencyId = String(row.agency);
        if (!agencyId || seen.has(agencyId))
            continue;
        seen.add(agencyId);
        yield notification_model_1.Notification.create({
            user: agencyId,
            message: `<strong>${caregiverName}</strong> replaced their ${label}. The new copy is in their package.`,
            type: 'credential_updated',
            credentialDocumentId: document._id,
            credentialName: label,
            ctaLink: `/agency/caregivers/${String(document.user)}`,
            isRead: false,
        });
    }
});
const uploadDocument = (file, payload, documentId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    // SCRUM-165: `part` only exists on the certificate, and only with one of the
    // two known values. Checked here rather than left to the schema enum, which
    // would surface as a 500 after the file had already gone to the CDN.
    const part = payload.part || undefined;
    if (part) {
        if (payload.documentType !== 'certifications') {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'A certificate part can only be given for the certificate');
        }
        if (!credentials_1.CERTIFICATE_PARTS.includes(part)) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Certificate part must be one of: ${credentials_1.CERTIFICATE_PARTS.join(', ')}`);
        }
    }
    // SCRUM-165: a caregiver has ONE RN/LPN practical sign-off, the same as the
    // GCHEXS confirmation below. Resolve the existing one when the client sends
    // no id, so a re-upload replaces it instead of adding a second sign-off row.
    // At most one sign-off is what keeps "every other certifications row is the
    // certificate" (isPrimaryCredentialRow) true everywhere else.
    if (!documentId &&
        payload.documentType === 'certifications' &&
        part === 'practical_signoff' &&
        userId) {
        const current = yield documents_model_1.Documents.findOne({
            user: userId,
            documentType: 'certifications',
            part: 'practical_signoff',
        }).sort({ updatedAt: -1 });
        if (current)
            documentId = String(current._id);
    }
    // SCRUM-145 / SCRUM-146: the GCHEXS confirmation is ONE document per
    // caregiver. The background-check editor uploaded it without an id, so every
    // save created a new row — a caregiver who edited the answer five times had
    // six GCHEXS documents, six history records, and six identical cards in the
    // Documents section. Resolve the existing one here, so a GCHEXS upload always
    // replaces it whatever the client sends.
    if (!documentId && payload.documentType === 'gchexs' && userId) {
        const current = yield documents_model_1.Documents.findOne({
            user: userId,
            documentType: 'gchexs',
        }).sort({ updatedAt: -1 });
        if (current)
            documentId = String(current._id);
    }
    // Check if this is an update or create operation
    const isUpdate = !!documentId;
    const existingDocument = isUpdate
        ? yield documents_model_1.Documents.findById(documentId)
        : null;
    // An update may only touch the caller's own document. Nothing checked this,
    // so any signed-in user who sent another user's documentId replaced that
    // file and took the row over (`user` is rewritten below). Same answer as a
    // missing id, so the endpoint does not confirm which ids exist.
    if (existingDocument && userId && String(existingDocument.user) !== String(userId)) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    }
    // File is only required for new documents, not for updates
    if (!isUpdate && !file) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'File is required');
    }
    // Upload file to Bunny CDN only if a new file is provided
    let fileUrl;
    if (file) {
        fileUrl = yield (0, bunny_upload_1.uploadFile)(file);
    }
    // Build the document object
    const documentData = {
        category: payload.category,
        documentType: payload.documentType,
        title: payload.title,
        // SCRUM-177: the privacy choice is gone from the upload form, so every
        // document is stored visible. The field is kept (the offer flow and the
        // document cards read it) and simply never written as 'private' again —
        // the smaller change, and nothing that reads it has to move.
        privacy: 'public',
        consent: payload.consent,
        user: userId,
    };
    // SCRUM-177 (Scenario 3): the consent record. Stamped on the row itself, the
    // way this codebase keeps its other per-document audit data (reviewedAt /
    // reviewedBy): who consented, when, and to which wording. Written only when
    // the box is actually ticked — the checkbox only appears on a medical upload.
    // A re-upload re-stamps it, because the consent belongs to the file that is
    // on the row now.
    //
    // The version is what makes the record mean anything, so it is required for
    // the stamp, not an optional extra on it. Screens with no consent checkbox
    // post `consent: 'true'` anyway (gchexs-section.tsx does) and send no version,
    // which stamped a consent record for wording the caregiver was never shown,
    // pointing at nothing. A stamped record now always reads "agreed to this
    // version of the wording"; the `consent` boolean itself is unchanged.
    const consentVersion = String(payload.consentVersion || '').trim();
    if (payload.consent === true && consentVersion) {
        documentData.consentAt = new Date();
        documentData.consentBy = userId;
        documentData.consentVersion = consentVersion;
    }
    // SCRUM-165: written only when sent, so an edit that leaves `part` out keeps
    // the half the row already is.
    if (part)
        documentData.part = part;
    // Only update URL if a new file was uploaded
    if (fileUrl) {
        documentData.url = fileUrl;
        documentData.fileSize = file === null || file === void 0 ? void 0 : file.size;
    }
    let result;
    if (!existingDocument) {
        // Create new document
        result = yield documents_model_1.Documents.create(documentData);
    }
    else {
        const updateQuery = {};
        // A replaced file has NOT been reviewed yet, so send the document back to
        // the pending queue and drop the previous verdict. Without this the row
        // kept whatever reviewStatus it already had: re-uploading after a rejection
        // showed "Document updated successfully!" while the credential stayed
        // `rejected`, so the Completing Profile modal kept demanding a re-upload
        // with no way out — and a replaced file on an approved credential silently
        // inherited the old approval. Metadata-only edits (title / privacy /
        // consent) deliberately do NOT reset the verdict; only a new file does.
        //
        // The confirmation data written by SCRUM-109/110 goes with the verdict. It
        // describes the certificate that WAS on the row, so leaving it behind meant
        // that after SCRUM-178's Update Verification the credential sat Pending
        // while still showing the superseded certificate's issue date, expiry date
        // and issuing organization — and the expiry countdown kept running off that
        // old date. wevoroCredentialId goes too: it is WeVoro's proof that WeVoro
        // checked THIS file, so the replacement earns a fresh one at its next
        // confirmation (a re-confirmation of the same file still keeps the id it
        // has, which is what reviewDocument's "issue once" rule is for).
        //
        // What was on file before the replacement is not lost: the audit row below
        // is written from existingDocument, which was read before this update.
        if (fileUrl && existingDocument.reviewStatus !== 'pending') {
            documentData.reviewStatus = 'pending';
            documentData.replacementRequested = false;
            updateQuery.$unset = {
                reviewedAt: '',
                reviewedBy: '',
                rejectionReason: '',
                rejectionReasonCode: '',
                aiSuggestedReason: '',
                adminAgreedWithAi: '',
                // The reading belongs to the file that was replaced.
                aiExtraction: '',
                credentialIssueDate: '',
                credentialExpirationDate: '',
                issuingOrganization: '',
                wevoroCredentialId: '',
            };
        }
        // Update existing document (only provided fields)
        updateQuery.$set = documentData;
        result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, updateQuery, {
            new: true,
        });
        // SCRUM-178: Update Verification — a new file over a credential WeVoro had
        // already confirmed — goes into the audit trail. It is logged here, in the
        // service, rather than from a second call the client makes, so it cannot be
        // skipped by whatever route reaches this method. The row records the state
        // the credential was in before the replacement knocked it back to pending.
        if (fileUrl && existingDocument.reviewStatus === 'approved') {
            yield (0, credential_audit_model_1.logCredentialAction)({
                caregiverId: String(existingDocument.user),
                actorId: userId,
                action: 'update_verification',
                document: existingDocument,
            });
        }
        // SCRUM-210: a new file over a credential is a replacement, so the
        // agencies holding live access are told. Metadata-only edits are not.
        if (fileUrl && result) {
            try {
                yield notifyAgenciesOfCredentialUpdate(result);
            }
            catch (err) {
                console.error('Failed to notify agencies of a credential update:', err);
            }
        }
    }
    return result;
});
const getUserDocuments = (userId, requesterId) => __awaiter(void 0, void 0, void 0, function* () {
    // SCRUM-176: oldest first, stated rather than assumed. Six builders resolve a
    // credential by keeping the LAST row of each type, on a query that carried no
    // sort at all — so the winner was whatever order the database happened to
    // return. createdAt ascending is exactly that effective order today, so no
    // verdict moves; it is only no longer left to chance.
    const all = yield documents_model_1.Documents.find({ user: userId }).sort({ createdAt: 1 });
    // SCRUM-146: caregivers who edited their background check before SCRUM-145
    // was fixed have several GCHEXS rows. Show only the newest, so the Documents
    // section lists it once. The older rows are left in place, not deleted.
    const gchexs = all.filter((d) => d.documentType === 'gchexs');
    const keepGchexs = gchexs.length > 1
        ? String(gchexs.reduce((a, b) => new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b)._id)
        : null;
    const result = keepGchexs
        ? all.filter((d) => d.documentType !== 'gchexs' || String(d._id) === keepGchexs)
        : all;
    // SCRUM-99: gate sensitive credentials for agencies (owner/admin see all).
    const { redactSensitiveDocuments, withPaywalledUrls } = yield Promise.resolve().then(() => __importStar(require('./credential-visibility')));
    // SCRUM-129: redact the sensitive tier rather than dropping the row, so a
    // gated credential never reads as "Not Uploaded".
    const visible = yield redactSensitiveDocuments(result, requesterId, userId);
    // SCRUM-119: and withhold the file link itself until the packet is paid for.
    // Without this the free credential list handed back the same CDN urls the
    // paid download sells.
    return withPaywalledUrls(visible, requesterId, userId);
});
const deleteDocument = (userId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    // A delete may only touch the caller's own document, the same rule the update
    // path above applies. Nothing checked this: the id came straight from the URL
    // and went straight to findByIdAndDelete, so any signed-in caregiver or agency
    // who sent another user's documentId deleted that user's credential. SCRUM-178
    // put a Remove button on every credential card, which makes this the primary
    // way the endpoint is reached.
    //
    // No admin bypass: every caller deletes the signed-in user's own row (the
    // credential card, the Documents section and the onboarding row all post their
    // own document id), and no admin screen deletes another user's document — the
    // admin acts on documents through reviewDocument instead.
    // includeResultMetadata: false is Mongoose's default; stated so the deleted
    // document itself is returned (and typed) rather than the driver's raw result.
    const result = yield documents_model_1.Documents.findOneAndDelete({ _id: documentId, user: userId }, { includeResultMetadata: false });
    // Same answer as a missing id, so the endpoint does not confirm which ids
    // exist.
    if (!result) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    }
    // SCRUM-178: Remove is auditable too, and this is the method the Remove
    // button reaches (the credential card's dialog sends DELETE /document/:id).
    // Logged from the deleted row, so the trail keeps what was removed after the
    // row itself is gone.
    yield (0, credential_audit_model_1.logCredentialAction)({
        caregiverId: String(result.user),
        actorId: userId,
        action: 'remove',
        document: result,
    });
    return result;
});
/**
 * SCRUM-109/110: WeVoro's own credential ID, generated at confirmation.
 * Sits alongside the provider's own ID (credentialIdNumber) so an agency can
 * see both — proof WeVoro checked it, and the number on the document itself.
 * Shape: WV-<CRED>-<YEAR>-<6 hex>, e.g. WV-CPR-2026-A3F91C
 */
const buildWevoroCredentialId = (documentType) => {
    const codes = {
        certifications: 'CRT',
        driver_license: 'DL',
        auto_insurance: 'INS',
        cpr_test: 'CPR',
        tb_tests: 'TB',
        gchexs: 'BGC',
    };
    const code = codes[documentType || ''] || 'DOC';
    const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `WV-${code}-${new Date().getFullYear()}-${rand}`;
};
const reviewDocument = (documentId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason, rejectionReasonCode, requestReplacement, aiSuggestedReason, adminAgreedWithAi, reviewedBy, hasNoExpiration, } = payload;
    if (reviewStatus === 'approved') {
        // SCRUM-109: Credential ID may legitimately be absent (TB test, some CPR
        // Tier 2 providers), and expiration is optional when hasNoExpiration is set
        // ("Reviewed, no fixed renewal"). Issue date + issuer remain required.
        if (!credentialIssueDate || !issuingOrganization) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Issue Date and Issuing Organization are required to confirm a credential');
        }
        if (!hasNoExpiration && !credentialExpirationDate) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Provide an Expiration Date, or mark the credential as having no expiration');
        }
        if (!hasNoExpiration && credentialExpirationDate) {
            const issueDate = new Date(credentialIssueDate);
            const expirationDate = new Date(credentialExpirationDate);
            if (expirationDate <= issueDate) {
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Expiration Date must be later than Issue Date');
            }
        }
    }
    // SCRUM-109: a rejection must record WHY, so require the caregiver-facing
    // message. The admin UI always sends one (see mark-not-confirmed-modal).
    if (reviewStatus === 'rejected' && !(rejectionReason === null || rejectionReason === void 0 ? void 0 : rejectionReason.trim())) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'A reason message for the caregiver is required when marking a document as not confirmed');
    }
    const set = { reviewStatus };
    const unset = {};
    if (reviewedBy)
        set.reviewedBy = reviewedBy;
    if (reviewStatus === 'approved') {
        const existing = yield documents_model_1.Documents.findById(documentId).select('documentType wevoroCredentialId');
        set.reviewedAt = new Date();
        set.credentialIdNumber = credentialIdNumber;
        set.credentialIssueDate = new Date(credentialIssueDate);
        set.issuingOrganization = issuingOrganization;
        set.replacementRequested = false;
        set.hasNoExpiration = hasNoExpiration === true;
        if (hasNoExpiration) {
            unset.credentialExpirationDate = '';
        }
        else {
            set.credentialExpirationDate = new Date(credentialExpirationDate);
        }
        // Issue WeVoro's own credential ID once, on first confirmation, and keep it
        // stable across re-confirmations so the agency-facing trail doesn't change.
        if (!(existing === null || existing === void 0 ? void 0 : existing.wevoroCredentialId)) {
            set.wevoroCredentialId = buildWevoroCredentialId(existing === null || existing === void 0 ? void 0 : existing.documentType);
        }
        // Clear any prior rejection.
        unset.rejectionReason = '';
        unset.rejectionReasonCode = '';
    }
    else if (reviewStatus === 'rejected') {
        set.rejectionReason = rejectionReason.trim();
        if (rejectionReasonCode)
            set.rejectionReasonCode = rejectionReasonCode;
        set.replacementRequested = requestReplacement === true;
        if (aiSuggestedReason)
            set.aiSuggestedReason = aiSuggestedReason;
        if (typeof adminAgreedWithAi === 'boolean')
            set.adminAgreedWithAi = adminAgreedWithAi;
        // Not confirmed is not a reviewed-and-valid state, so drop the confirmation
        // timestamp. The extracted credential fields are deliberately RETAINED —
        // the admin view still shows Certificate ID / dates / issuer on a
        // not-confirmed card so the caregiver and admin can see what was rejected.
        unset.reviewedAt = '';
    }
    // NOTE: this previously passed `undefined` values to findByIdAndUpdate to
    // "clear" fields. Mongoose drops undefined keys, so those clears were silently
    // no-ops and stale metadata survived. Use an explicit $unset.
    const updateQuery = { $set: set };
    if (Object.keys(unset).length > 0)
        updateQuery.$unset = unset;
    const result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, updateQuery, { new: true });
    // SCRUM-102 renewal reset: when a credential is (re-)approved with a new
    // expiration date, its prior expiration notifications must stop answering the
    // dedup check so the next lifecycle fires fresh. Without that, the dedup keyed
    // on (user, credentialDocumentId, type) permanently suppresses
    // re-notification after a renewal, since the same document _id is reused.
    //
    // SCRUM-192: this used to deleteMany them, which re-armed the cron but wiped
    // the caregiver's history — the "Expiring Soon"/"Urgent" alerts they had
    // already received vanished from the Notifications list the moment the
    // credential was renewed. The rows are now stamped as superseded instead:
    // they stay in the list as the record of what happened, and the dedup check
    // (isNotificationAlreadySent) ignores a stamped row, so the re-arming the
    // delete was there for is unchanged.
    if (reviewStatus === 'approved' && result) {
        const { Notification } = yield Promise.resolve().then(() => __importStar(require('../user/notification.model')));
        yield Notification.updateMany({
            credentialDocumentId: documentId,
            type: { $in: ['credential_yellow', 'credential_red', 'credential_expired'] },
            supersededAt: { $exists: false },
        }, { $set: { supersededAt: new Date() } });
    }
    /*
     * SCRUM-151: the admin's background-check decision and the caregiver's GCHEXS
     * Confirmation are two halves of one fact, and they have to agree whichever
     * half the admin touches.
     *
     * The decision half already wrote the document (user.service, on
     * backgroundCheckStatus). This is the other direction, which was missing: an
     * admin who confirms the GCHEXS in the Credential confirmation list — the
     * natural place to do it, since it sits with the other five credentials —
     * reviewed the document and nothing else. The caregiver's page then read
     * "Reviewed" while the admin's own Background check still read "Pending
     * review", with no control on that panel that would bring the two together.
     *
     * Reviewing the document now writes the matching decision, so both sides say
     * the same thing from either entry point. Best-effort: the review is already
     * saved, and a failure here must not read as a failed review.
     */
    if (result && String(result.documentType) === 'gchexs') {
        try {
            const { User } = yield Promise.resolve().then(() => __importStar(require('../user/user.model')));
            yield User.findByIdAndUpdate(result.user, {
                $set: {
                    backgroundCheckStatus: reviewStatus === 'approved' ? 'verified' : 'failed',
                    backgroundCheckUpdatedAt: new Date(),
                },
            });
        }
        catch (err) {
            console.error(`[background-check] could not sync the decision for ${String(result.user)}:`, err);
        }
    }
    // SCRUM-65: Fire rejection notification in real-time
    if (reviewStatus === 'rejected' && result) {
        // Resolve role-driven label for the certificate row
        let roleLabel = 'CNA Certificate';
        try {
            const { ProfessionalInfo } = yield Promise.resolve().then(() => __importStar(require('../user/professional-info.model')));
            const profInfo = yield ProfessionalInfo.findOne({ user: result.user }).lean();
            if ((profInfo === null || profInfo === void 0 ? void 0 : profInfo.role) === 'PCA')
                roleLabel = 'PCA Certificate';
        }
        catch (_a) { }
        const CREDENTIAL_LABELS = {
            certifications: roleLabel,
            driver_license: "Driver's License",
            auto_insurance: 'Auto Insurance',
            cpr_test: 'CPR Test',
            tb_tests: 'TB Test',
        };
        // SCRUM-165: the sign-off is a 'certifications' row too, so rejecting it
        // told the caregiver their PCA Certificate had been rejected.
        const credentialName = result.documentType === 'certifications' && result.part === 'practical_signoff'
            ? credentials_1.PCA_SIGNOFF_LABEL
            : CREDENTIAL_LABELS[result.documentType] || result.title || 'Credential';
        try {
            yield (0, credential_notification_service_1.fireRejectionNotification)({
                caregiverId: result.user.toString(),
                credentialDocumentId: result._id.toString(),
                credentialName,
                rejectionReason: rejectionReason || '',
            });
        }
        catch (err) {
            console.error('Failed to send rejection notification:', err);
        }
    }
    return result;
});
const getCredentialStatus = (userId, requesterId) => __awaiter(void 0, void 0, void 0, function* () {
    // SCRUM-60: [Role] Certificate label is derived from professionalInfo.role at view time.
    const { ProfessionalInfo } = yield Promise.resolve().then(() => __importStar(require('../user/professional-info.model')));
    const profInfo = yield ProfessionalInfo.findOne({ user: userId }).lean();
    const role = (profInfo === null || profInfo === void 0 ? void 0 : profInfo.role) === 'PCA' ? 'PCA' : 'CNA';
    // SCRUM-93: keys come from the shared required list so this view and
    // calculateProCompletion can never disagree about what "required" means.
    const CREDENTIAL_META = {
        certifications: { label: `${role} Certificate`, category: 'non_medical' },
        driver_license: { label: "Driver's License", category: 'non_medical' },
        auto_insurance: { label: 'Auto Insurance', category: 'non_medical' },
        cpr_test: { label: 'CPR Test', category: 'medical' },
        tb_tests: { label: 'TB Test', category: 'medical' },
    };
    const REQUIRED_CREDENTIALS = credentials_1.REQUIRED_CREDENTIAL_KEYS.map(key => (Object.assign({ key }, CREDENTIAL_META[key])));
    // SCRUM-176: oldest first, for the same reason as getUserDocuments — the
    // by-type map below keeps the last row it sees, so the order it sees them in
    // decides the credential. createdAt ascending is today's effective order.
    const all = yield documents_model_1.Documents.find({ user: userId }).sort({ createdAt: 1 });
    // This view took no requester at all, so it applied neither the SCRUM-99
    // tier gate nor the SCRUM-119 paywall while still returning doc.url — the
    // agency's "View Credential" link served the very file the paid download
    // sells. Both gates are applied here now, exactly as getUserDocuments does.
    const { redactSensitiveDocuments, withPaywalledUrls } = yield Promise.resolve().then(() => __importStar(require('./credential-visibility')));
    const visible = yield redactSensitiveDocuments(all, requesterId, userId);
    const documents = yield withPaywalledUrls(visible, requesterId, userId);
    // SCRUM-165: the RN/LPN practical sign-off is a second 'certifications' row.
    // Keyed by type alone, whichever row came last became the "PCA Certificate",
    // so only the primary row (written exam or legacy certificate) is mapped.
    const docsByType = {};
    documents.forEach((doc) => {
        if ((0, credentials_1.isPrimaryCredentialRow)(doc))
            docsByType[doc.documentType] = doc;
    });
    return REQUIRED_CREDENTIALS.map(cred => {
        const doc = docsByType[cred.key];
        if (!doc) {
            return Object.assign(Object.assign({}, cred), { state: 'not_uploaded', document: null });
        }
        return Object.assign(Object.assign({}, cred), { state: doc.reviewStatus === 'approved' ? 'verified' : doc.reviewStatus, document: {
                _id: doc._id,
                title: doc.title,
                url: doc.url,
                reviewStatus: doc.reviewStatus,
                reviewedAt: doc.reviewedAt,
                credentialIdNumber: doc.credentialIdNumber,
                credentialIssueDate: doc.credentialIssueDate,
                credentialExpirationDate: doc.credentialExpirationDate,
                // SCRUM-182: this projection left `hasNoExpiration` out, so a reader of
                // this route could not tell a credential the admin confirmed as
                // "Reviewed, no fixed renewal" (SCRUM-109) from one with a real expiry
                // — the caregiver's card reads exactly this flag to print "No official
                // expiration date", and without it would print whatever stale date the
                // row still carried. GET /document?userId= (getUserDocuments above)
                // returns the whole row and has always carried it; the two credential
                // builders now answer the same thing about what the admin confirmed.
                hasNoExpiration: doc.hasNoExpiration === true,
                issuingOrganization: doc.issuingOrganization,
                rejectionReason: doc.rejectionReason,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                category: doc.category,
                documentType: doc.documentType,
            } });
    });
});
const removeCredential = (documentId, 
// SCRUM-178: who removed it. The route is caregiver-only, so this is the
// caregiver; passed in rather than assumed from the row so the trail records
// the account that acted.
actorId) => __awaiter(void 0, void 0, void 0, function* () {
    // Scoped to the caller's own row, the same as deleteDocument: this took the id
    // from the URL and deleted whatever it named, so one caregiver could remove
    // another caregiver's credential. The route is PRO-only and the controller
    // always sends the caller's id; an unidentified caller can therefore own
    // nothing, and is answered as if the id did not exist.
    const result = actorId
        ? yield documents_model_1.Documents.findOneAndDelete({ _id: documentId, user: actorId }, { includeResultMetadata: false })
        : null;
    if (!result) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    }
    // SCRUM-178: the other Remove path, logged the same way.
    yield (0, credential_audit_model_1.logCredentialAction)({
        caregiverId: String(result.user),
        actorId,
        action: 'remove',
        document: result,
    });
    return result;
});
/**
 * SCRUM-130 — resolve a credential for inline viewing.
 *
 * Viewing a credential is free (SCRUM-119 lists packet viewing as explicitly
 * out of the paywall's scope); paying is for the download. The reason viewing
 * was blocked at all is that the read paths withhold `url`, and they withhold
 * it for a good reason: the Bunny CDN links are unsigned and world-readable,
 * so any response carrying one has already handed over the file.
 *
 * So the url stays withheld and the bytes are served through here instead:
 * authenticated, subject to the same tier gate, and never revealing where the
 * file actually lives. That keeps the $49.99 download worth paying for.
 */
const viewDocument = (documentId, requesterId, fetchDest) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield documents_model_1.Documents.findById(documentId);
    if (!doc || !doc.url) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    }
    const { redactSensitiveDocuments } = yield Promise.resolve().then(() => __importStar(require('./credential-visibility')));
    const [checked] = yield redactSensitiveDocuments([doc], requesterId, String(doc.user));
    if (!checked || checked.restricted) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Your agency must be confirmed by WeVoro before this credential can be opened.');
    }
    // SCRUM-63: an agency may only open a credential WeVoro has confirmed.
    // Pending means nobody has checked the document yet, and not-confirmed means
    // it failed review — handing either to an agency would pass an unverified
    // file off as a credential. The owner and admins keep access in every state.
    // This is the boundary that matters: the frontend hides the link, but the
    // route is what stops a guessed document id.
    const isOwner = !!requesterId && requesterId.toString() === String(doc.user);
    if (!isOwner) {
        const requester = requesterId
            ? yield user_model_1.User.findById(requesterId, { role: 1 })
            : null;
        const isAdmin = (requester === null || requester === void 0 ? void 0 : requester.role) === 'admin' || (requester === null || requester === void 0 ? void 0 : requester.role) === 'super_admin';
        if (!isAdmin && doc.reviewStatus !== 'approved') {
            throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'This credential has not been confirmed by WeVoro yet.');
        }
        // SCRUM-130: viewing is free, downloading is paid. Serving the file into a
        // tab of its own defeats that, because the browser's PDF viewer puts a
        // download button above it — two clicks and the agency has the file the
        // $49.99 packet sells. So an agency that has not bought the packet may read
        // the document only as an embedded subresource, which is the in-app preview.
        // Once they have paid, any way of opening it is theirs.
        //
        // Sec-Fetch-Dest is 'iframe'/'embed'/'object' for the preview and 'document'
        // for a top-level navigation. A browser too old to send it is not treated as
        // a bypass — the header arrives empty and is allowed — because the point
        // here is to close the obvious path, not to pretend a rendered document can
        // ever be made unsaveable.
        if (!isAdmin) {
            const { findEntitlement } = yield Promise.resolve().then(() => __importStar(require('../payment/payment.service')));
            const paid = yield findEntitlement(String(requesterId), String(doc.user));
            const topLevel = fetchDest === 'document';
            if (!paid && topLevel) {
                throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Open this credential from the caregiver’s profile. Unlock the packet to download it.');
            }
        }
    }
    return doc;
});
exports.DocumentService = {
    uploadDocument,
    getUserDocuments,
    deleteDocument,
    reviewDocument,
    getCredentialStatus,
    removeCredential,
    viewDocument,
};
