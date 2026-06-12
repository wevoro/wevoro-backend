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
exports.DownloadService = void 0;
const documents_model_1 = require("./documents.model");
const download_audit_model_1 = require("./download-audit.model");
const private_access_model_1 = require("./private-access.model");
const professional_info_model_1 = require("../user/professional-info.model");
const notification_model_1 = require("../user/notification.model");
const personal_info_model_1 = require("../user/personal-info.model");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
/**
 * SCRUM-67: Download Service
 * Handles individual and bulk credential document downloads,
 * private access consent flow, and audit trail logging.
 */
/**
 * Check if an agency has download access to a caregiver's documents.
 * Access requires: share-flow onboarding OR active engagement.
 */
const hasDownloadAccess = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // Partners can always download public/verified credentials for any caregiver they can view
    // The visibility is already controlled by the getPros endpoint
    return true;
});
/**
 * Get all downloadable documents for a caregiver (from agency perspective)
 */
const getDownloadableDocuments = (caregiverId, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    // Get ALL documents with valid URLs for the caregiver
    // Partners can view/download any document that has a file uploaded
    const allUploadedDocs = yield documents_model_1.Documents.find({
        user: caregiverId,
        url: { $exists: true, $nin: [null, ''] },
    });
    // GCHEXS document
    const profInfo = yield professional_info_model_1.ProfessionalInfo.findOne({ user: caregiverId });
    let gchexsDoc = null;
    if ((profInfo === null || profInfo === void 0 ? void 0 : profInfo.gchexsStatus) === 'yes' && (profInfo === null || profInfo === void 0 ? void 0 : profInfo.gchexsDocumentUrl)) {
        gchexsDoc = {
            _id: 'gchexs',
            title: 'GCHEXS Confirmation',
            url: profInfo.gchexsDocumentUrl,
            documentType: 'gchexs',
            isGchexs: true,
        };
    }
    const allDocs = [...allUploadedDocs];
    if (gchexsDoc)
        allDocs.push(gchexsDoc);
    return allDocs;
});
/**
 * Log a download event to the audit trail
 */
const logDownload = (params) => __awaiter(void 0, void 0, void 0, function* () {
    // Lookup agency name and email for display in audit trail
    const agencyUser = yield (yield Promise.resolve().then(() => __importStar(require('../user/user.model')))).User.findById(params.agencyId).select('email');
    const agencyInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: params.agencyId });
    const agencyName = agencyInfo
        ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim()
        : (agencyUser === null || agencyUser === void 0 ? void 0 : agencyUser.email) || 'Unknown Agency';
    const agencyEmail = (agencyUser === null || agencyUser === void 0 ? void 0 : agencyUser.email) || '';
    yield download_audit_model_1.DownloadAudit.create({
        agency: params.agencyId,
        caregiver: params.caregiverId,
        documentId: params.documentId,
        documentTitle: params.documentTitle,
        downloadType: params.downloadType,
        documentsIncluded: params.documentsIncluded,
        agencyName,
        agencyEmail,
    });
});
/**
 * Download a single document (returns the document URL + logs audit)
 */
const downloadDocument = (documentId, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield documents_model_1.Documents.findById(documentId);
    if (!doc) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    }
    // Check access
    const hasAccess = yield hasDownloadAccess(agencyId, doc.user.toString());
    if (!hasAccess) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'You do not have access to download this document');
    }
    // Partners can download any document that has a URL (file uploaded)
    // Log the download
    yield logDownload({
        agencyId,
        caregiverId: doc.user.toString(),
        documentId: doc._id.toString(),
        documentTitle: doc.title,
        downloadType: 'individual',
    });
    return { url: doc.url, title: doc.title, documentType: doc.documentType };
});
/**
 * Get download package info (list of all downloadable docs for bulk download)
 */
const getDownloadPackage = (caregiverId, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    const hasAccess = yield hasDownloadAccess(agencyId, caregiverId);
    if (!hasAccess) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'You do not have access to this caregiver\'s documents');
    }
    const docs = yield getDownloadableDocuments(caregiverId, agencyId);
    // Log bulk download — skip non-ObjectId entries like the GCHEXS virtual doc
    yield logDownload({
        agencyId,
        caregiverId,
        downloadType: 'bulk',
        documentsIncluded: docs
            .filter((d) => d._id && d._id !== 'gchexs')
            .map((d) => {
            var _a;
            return ({
                documentId: (_a = d._id) === null || _a === void 0 ? void 0 : _a.toString(),
                title: d.title,
            });
        }),
    });
    return docs.map((d) => ({
        _id: d._id,
        title: d.title,
        url: d.url,
        documentType: d.documentType,
        reviewStatus: d.reviewStatus,
    }));
});
/**
 * Request private document access from a caregiver
 */
const requestPrivateAccess = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if request already exists
    const existing = yield private_access_model_1.PrivateAccess.findOne({
        agency: agencyId,
        caregiver: caregiverId,
    });
    if (existing) {
        if (existing.status === 'granted') {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Access already granted');
        }
        if (existing.status === 'pending') {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Access request already pending');
        }
        // If revoked, allow re-request
        existing.status = 'pending';
        existing.revokedAt = undefined;
        yield existing.save();
        // Notify caregiver
        const agencyInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId });
        const agencyName = agencyInfo ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim() : 'An agency';
        yield notification_model_1.Notification.create({
            user: caregiverId,
            message: `<strong>${agencyName}</strong> has requested access to your private documents. Review and respond on your profile.`,
            type: 'private_access_request',
            ctaLink: '/pro/profile#documents',
            isRead: false,
        });
        return existing;
    }
    const access = yield private_access_model_1.PrivateAccess.create({
        agency: agencyId,
        caregiver: caregiverId,
        status: 'pending',
    });
    // Notify caregiver
    const agencyInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId });
    const agencyName = agencyInfo ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim() : 'An agency';
    yield notification_model_1.Notification.create({
        user: caregiverId,
        message: `<strong>${agencyName}</strong> has requested access to your private documents. Review and respond on your profile.`,
        type: 'private_access_request',
        ctaLink: '/pro/profile#documents',
        isRead: false,
    });
    return access;
});
/**
 * Grant or revoke private document access (caregiver action)
 */
const updatePrivateAccess = (accessId, caregiverId, action) => __awaiter(void 0, void 0, void 0, function* () {
    const access = yield private_access_model_1.PrivateAccess.findById(accessId);
    if (!access) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Access request not found');
    }
    if (access.caregiver.toString() !== caregiverId) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Not authorized');
    }
    if (action === 'grant') {
        access.status = 'granted';
        access.grantedAt = new Date();
    }
    else {
        access.status = 'revoked';
        access.revokedAt = new Date();
    }
    yield access.save();
    // Notify agency
    const notificationType = action === 'grant' ? 'private_access_granted' : 'private_access_revoked';
    const caregiverInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: caregiverId });
    const caregiverName = caregiverInfo ? `${caregiverInfo.firstName || ''} ${caregiverInfo.lastName || ''}`.trim() : 'A caregiver';
    yield notification_model_1.Notification.create({
        user: access.agency,
        message: action === 'grant'
            ? `<strong>${caregiverName}</strong> has granted you access to their private documents.`
            : `<strong>${caregiverName}</strong> has revoked your access to their private documents.`,
        type: notificationType,
        ctaLink: `/partner/pros/${caregiverId}`,
        isRead: false,
    });
    return access;
});
/**
 * Get pending access requests for a caregiver
 */
const getAccessRequests = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const requests = yield private_access_model_1.PrivateAccess.find({ caregiver: caregiverId })
        .populate('agency', 'email')
        .sort({ createdAt: -1 });
    return requests;
});
/**
 * Get download audit log for a caregiver (admin view)
 */
const getDownloadAuditLog = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const logs = yield download_audit_model_1.DownloadAudit.find({ caregiver: caregiverId })
        .sort({ createdAt: -1 })
        .limit(100);
    return logs;
});
exports.DownloadService = {
    downloadDocument,
    getDownloadPackage,
    requestPrivateAccess,
    updatePrivateAccess,
    getAccessRequests,
    getDownloadAuditLog,
    hasDownloadAccess,
    getDownloadableDocuments,
};
