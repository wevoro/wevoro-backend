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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    }
    let result;
    if (!existingDocument) {
        // Create new document
        result = yield documents_model_1.Documents.create(documentData);
    }
    else {
        // Update existing document (only provided fields)
        result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, documentData, {
            new: true,
        });
    }
    return result;
});
const getUserDocuments = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.find({ user: userId });
    console.log('🚀 ~ getUserDocuments ~ result:', result);
    return result;
});
const deleteDocument = (userId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.findByIdAndDelete(documentId);
    return result;
});
const reviewDocument = (documentId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason } = payload;
    if (reviewStatus === 'approved') {
        if (!credentialIdNumber || !credentialIssueDate || !credentialExpirationDate || !issuingOrganization) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Credential ID, Issue Date, Expiration Date, and Issuing Organization are required for approval');
        }
        const issueDate = new Date(credentialIssueDate);
        const expirationDate = new Date(credentialExpirationDate);
        if (expirationDate <= issueDate) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Expiration Date must be later than Issue Date');
        }
    }
    const updateData = { reviewStatus };
    if (reviewStatus === 'approved') {
        updateData.reviewedAt = new Date();
        updateData.credentialIdNumber = credentialIdNumber;
        updateData.credentialIssueDate = new Date(credentialIssueDate);
        updateData.credentialExpirationDate = new Date(credentialExpirationDate);
        updateData.issuingOrganization = issuingOrganization;
        // Clear rejection reason if previously rejected
        updateData.rejectionReason = undefined;
    }
    else if (reviewStatus === 'rejected') {
        updateData.rejectionReason = rejectionReason || '';
        // Clear approval metadata
        updateData.reviewedAt = undefined;
        updateData.credentialIdNumber = undefined;
        updateData.credentialIssueDate = undefined;
        updateData.credentialExpirationDate = undefined;
        updateData.issuingOrganization = undefined;
    }
    const result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, updateData, { new: true });
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
    const REQUIRED_CREDENTIALS = [
        { key: 'certifications', label: `${role} Certificate`, category: 'non_medical' },
        { key: 'driver_license', label: "Driver's License", category: 'non_medical' },
        { key: 'auto_insurance', label: 'Auto Insurance', category: 'non_medical' },
        { key: 'cpr_test', label: 'CPR Test', category: 'medical' },
        { key: 'tb_tests', label: 'TB Test', category: 'medical' },
    ];
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
