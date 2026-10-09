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
exports.DocumentController = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const document_service_1 = require("./document.service");
const download_service_1 = require("./download.service");
const credential_ai_service_1 = require("./credential-ai.service");
const credential_ai_decide_1 = require("./credential-ai.decide");
const credential_ai_settings_1 = require("./credential-ai.settings");
const uploadDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const file = req.file;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    // SCRUM-165: `part` says which half of the PCA certificate this file is
    // (written exam or RN/LPN practical sign-off). It was not read here, so a
    // sign-off landed as a plain second certificate row.
    // SCRUM-177: `consentVersion` is the version of the medical-consent wording
    // the caregiver ticked, posted alongside `consent`. Read here or the service
    // never sees it and the consent record has nothing to point at.
    const { category, documentType, title, isPublic, consent, consentVersion, documentId, part, } = req.body;
    const result = yield document_service_1.DocumentService.uploadDocument(file, {
        category,
        documentType,
        title,
        isPublic: isPublic === 'true' || isPublic === true,
        consent: consent === 'true' || consent === true,
        consentVersion,
        user: userId,
        part,
    }, documentId, userId);
    // When AI automation is switched on, the credential is read and decided here
    // rather than waiting for an admin to open it. Awaited, because a serverless
    // function stops executing the moment it responds — and swallowed inside, so
    // it can never turn a successful upload into an error for the caregiver.
    yield (0, credential_ai_decide_1.autoDecideOnUpload)((result === null || result === void 0 ? void 0 : result._id) ? String(result._id) : undefined);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Document uploaded successfully!',
        data: result,
    });
}));
const getUserDocuments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const queryUserId = req.query.userId;
    const userId = queryUserId ? queryUserId : (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    // SCRUM-99: pass the requester so agencies are gated to their allowed tier.
    const result = yield document_service_1.DocumentService.getUserDocuments(userId, (_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Documents retrieved successfully!',
        data: result,
    });
}));
const deleteDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const { documentId } = req.params;
    const result = yield document_service_1.DocumentService.deleteDocument(userId, documentId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Document deleted successfully!',
        data: result,
    });
}));
const reviewDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { documentId } = req.params;
    const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason, 
    // SCRUM-109
    rejectionReasonCode, requestReplacement, aiSuggestedReason, adminAgreedWithAi, 
    // SCRUM-109: confirm a credential that has no fixed renewal date. Dropped
    // here until now, so the service never saw it and the "expiry is required"
    // guard threw on every never-expiring credential — the checkbox, the model
    // field and the caregiver-facing "No official expiration date" copy all
    // existed but were unreachable.
    hasNoExpiration, } = req.body;
    const result = yield document_service_1.DocumentService.reviewDocument(documentId, {
        reviewStatus,
        credentialIdNumber,
        credentialIssueDate,
        credentialExpirationDate,
        issuingOrganization,
        rejectionReason,
        rejectionReasonCode,
        requestReplacement,
        aiSuggestedReason,
        adminAgreedWithAi,
        hasNoExpiration,
        reviewedBy: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Document ${reviewStatus} successfully!`,
        data: result,
    });
}));
// Admin: read this credential with AI and pre-fill the confirmation form.
// Suggestion only — it writes nothing to reviewStatus.
const aiExtractCredential = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { documentId } = req.params;
    // AI assist off means the admin asked not to be shown a suggestion at all.
    // Answered as a normal 200 with a flag, so the modal simply shows no panel
    // instead of an error the admin would have to dismiss.
    const settings = yield (0, credential_ai_settings_1.getAiSettings)();
    if (!settings.assistEnabled) {
        (0, sendResponse_1.default)(res, {
            statusCode: http_status_1.default.OK,
            success: true,
            message: 'AI assist is turned off',
            data: { disabled: true },
        });
        return;
    }
    const result = yield (0, credential_ai_service_1.extractCredential)(documentId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Document read successfully!',
        data: result,
    });
}));
/**
 * Admin "Run AI check": read and decide every required credential this
 * caregiver has uploaded, in one go.
 */
const aiReviewUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    const result = yield (0, credential_ai_decide_1.decideAllForUser)(userId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: result.ran ? 'Credentials checked' : result.reason || 'Nothing to check',
        data: result,
    });
}));
const getCredentialAiSettings = (0, catchAsync_1.default)((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, credential_ai_settings_1.getAiSettings)();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'AI settings retrieved',
        data: result,
    });
}));
const updateCredentialAiSettings = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { assistEnabled, automationEnabled } = req.body || {};
    const result = yield (0, credential_ai_settings_1.updateAiSettings)({ assistEnabled, automationEnabled }, (_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'AI settings updated',
        data: result,
    });
}));
const getCredentialStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { userId } = req.params;
    // SCRUM-99 / SCRUM-119: pass the requester, so this view is gated to the
    // caller's tier and withholds the file url until the packet is paid for.
    const result = yield document_service_1.DocumentService.getCredentialStatus(userId, (_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Credential status retrieved successfully!',
        data: result,
    });
}));
const removeCredential = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { documentId } = req.params;
    // SCRUM-178: pass who removed it, for the audit row.
    const result = yield document_service_1.DocumentService.removeCredential(documentId, (_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Credential removed successfully!',
        data: result,
    });
}));
// SCRUM-67: Download a single document
const downloadDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { documentId } = req.params;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.downloadDocument(documentId, agencyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Document download URL retrieved!',
        data: result,
    });
}));
// SCRUM-119 (A10): one signed document from a paid packet.
const downloadSignedDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { caregiverUserId, itemId } = req.params;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.downloadSignedDocument(caregiverUserId, itemId, agencyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Signed document download URL retrieved!',
        data: result,
    });
}));
// SCRUM-67: Get bulk download package info
// SCRUM-119: the locked/unlocked file list for the documents modal. Viewing is
// free, so this returns metadata for every file but a url only once paid.
const getPacketManifest = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { caregiverUserId } = req.params;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.getPacketManifest(caregiverUserId, agencyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Packet manifest retrieved!',
        data: result,
    });
}));
const getDownloadPackage = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { caregiverUserId } = req.params;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.getDownloadPackage(caregiverUserId, agencyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Download package retrieved!',
        data: result,
    });
}));
// SCRUM-67: Request private document access
const requestPrivateAccess = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { caregiverUserId } = req.params;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.requestPrivateAccess(agencyId, caregiverUserId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Private access requested!',
        data: result,
    });
}));
// SCRUM-67: Grant or revoke private access (caregiver action)
const updatePrivateAccess = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { accessId } = req.params;
    const { action } = req.body; // 'grant' or 'revoke'
    const caregiverId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.updatePrivateAccess(accessId, caregiverId, action);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Private access ${action}ed successfully!`,
        data: result,
    });
}));
// SCRUM-67: Get access requests for a caregiver
const getAccessRequests = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const caregiverId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield download_service_1.DownloadService.getAccessRequests(caregiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Access requests retrieved!',
        data: result,
    });
}));
// SCRUM-67: Get download audit log (admin)
const getDownloadAuditLog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { caregiverUserId } = req.params;
    const result = yield download_service_1.DownloadService.getDownloadAuditLog(caregiverUserId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Download audit log retrieved!',
        data: result,
    });
}));
/**
 * SCRUM-119: the only file types the free view lets the browser render inline.
 * A PDF or a bitmap image cannot run script; SVG, HTML and XML can.
 */
const INLINE_VIEW_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
/**
 * SCRUM-130 — stream the credential inline, so the agency can read it without
 * paying and without ever being handed the CDN link.
 */
const viewDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const doc = yield document_service_1.DocumentService.viewDocument(req.params.documentId, (_a = req.user) === null || _a === void 0 ? void 0 : _a._id, 
    // Forwarded by the Next proxy from the browser's Sec-Fetch-Dest. The
    // service uses it to tell the in-app preview from someone opening the
    // address in a tab of its own.
    String(req.headers['x-wevoro-fetch-dest'] || ''));
    const upstream = yield fetch(doc.url);
    if (!upstream.ok) {
        throw new ApiError_1.default(http_status_1.default.BAD_GATEWAY, 'Could not load this document right now. Please try again.');
    }
    const ext = ((_b = String(doc.url).split('?')[0].split('.').pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || 'pdf';
    const safeName = String(doc.title || doc.documentType || 'document').replace(/[^\w.-]+/g, '_');
    // SCRUM-119: the file's real type. A PNG credential was served as
    // "application/png", which no browser can show inline, so the free in-app
    // preview downloaded the file instead of displaying it.
    //
    // Only a type on INLINE_VIEW_TYPES is ever sent, never the CDN's own answer
    // as-is: this response is rendered inline on the app's own origin (the Next
    // proxy passes it through), and uploads are not filtered by type, so a
    // credential named x.svg or x.html with a <script> inside would otherwise run
    // with the viewing agency's session. Anything else is sent as opaque bytes.
    const knownType = (((_c = (0, download_service_1.fileTypeFromUrl)(doc.url)) === null || _c === void 0 ? void 0 : _c.mimeType) ||
        String(upstream.headers.get('content-type') || '').split(';')[0])
        .trim()
        .toLowerCase();
    const contentType = INLINE_VIEW_TYPES.has(knownType)
        ? knownType
        : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // The browser must not second-guess that type from the bytes.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // No script, no same-origin, whatever the file turns out to hold. Not on a
    // PDF: Chrome's PDF viewer does not load in a sandboxed document, which would
    // blank the free preview of every PDF credential, and a PDF cannot run script
    // on our origin anyway.
    if (contentType !== 'application/pdf') {
        res.setHeader('Content-Security-Policy', 'sandbox');
    }
    // inline, not attachment: this is the free read, not the paid download.
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.${ext}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(yield upstream.arrayBuffer()));
}));
/** SCRUM-67: the whole package as a single zip, so every file actually lands. */
const getDownloadPackageZip = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { caregiverUserId } = req.params;
    const { buffer, fileName, count, credentialCount, signedCount } = yield download_service_1.DownloadService.getDownloadPackageZip(caregiverUserId, (_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // SCRUM-67: every file in the ZIP, signed documents included. The toast reads
    // this instead of counting the credential list on the client.
    res.setHeader('X-Document-Count', String(count));
    res.setHeader('X-Credential-Count', String(credentialCount));
    res.setHeader('X-Signed-Count', String(signedCount));
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
}));
exports.DocumentController = {
    uploadDocument,
    getUserDocuments,
    deleteDocument,
    reviewDocument,
    aiExtractCredential,
    aiReviewUser,
    getCredentialAiSettings,
    updateCredentialAiSettings,
    getCredentialStatus,
    removeCredential,
    downloadDocument,
    getDownloadPackage,
    getDownloadPackageZip,
    getPacketManifest,
    downloadSignedDocument,
    requestPrivateAccess,
    updatePrivateAccess,
    getAccessRequests,
    getDownloadAuditLog,
    viewDocument,
};
