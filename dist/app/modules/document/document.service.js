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
const uploadDocument = (file, payload, documentId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if this is an update or create operation
    const isUpdate = !!documentId;
    console.log('🚀 ~ uploadDocument ~ isUpdate:', isUpdate);
    const existingDocument = isUpdate
        ? yield documents_model_1.Documents.findById(documentId)
        : null;
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
        privacy: payload.isPublic ? 'public' : 'private',
        consent: payload.consent,
        user: userId,
    };
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
        // The extracted credential fields (ID number, dates, issuer,
        // wevoroCredentialId) are RETAINED, matching reviewDocument's rejection
        // path, so the admin still sees what was previously on file.
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
            };
        }
        // Update existing document (only provided fields)
        updateQuery.$set = documentData;
        result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, updateQuery, {
            new: true,
        });
    }
    return result;
});
const getUserDocuments = (userId, requesterId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.find({ user: userId });
    // SCRUM-99: gate sensitive credentials for agencies (owner/admin see all).
    const { filterVisibleDocuments } = yield Promise.resolve().then(() => __importStar(require('./credential-visibility')));
    return filterVisibleDocuments(result, requesterId, userId);
});
const deleteDocument = (userId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.findByIdAndDelete(documentId);
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
    // expiration date, clear its prior expiration notifications so the next
    // lifecycle fires fresh. Without this, the dedup keyed on
    // (user, credentialDocumentId, type) permanently suppresses re-notification
    // after a renewal, since the same document _id is reused.
    if (reviewStatus === 'approved' && result) {
        const { Notification } = yield Promise.resolve().then(() => __importStar(require('../user/notification.model')));
        yield Notification.deleteMany({
            credentialDocumentId: documentId,
            type: { $in: ['credential_yellow', 'credential_red', 'credential_expired'] },
        });
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
        const credentialName = CREDENTIAL_LABELS[result.documentType] || result.title || 'Credential';
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
const getCredentialStatus = (userId) => __awaiter(void 0, void 0, void 0, function* () {
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
    const documents = yield documents_model_1.Documents.find({ user: userId });
    const docsByType = {};
    documents.forEach((doc) => {
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
                issuingOrganization: doc.issuingOrganization,
                rejectionReason: doc.rejectionReason,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                category: doc.category,
                documentType: doc.documentType,
            } });
    });
});
const removeCredential = (documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.findByIdAndDelete(documentId);
    return result;
});
exports.DocumentService = {
    uploadDocument,
    getUserDocuments,
    deleteDocument,
    reviewDocument,
    getCredentialStatus,
    removeCredential,
};
