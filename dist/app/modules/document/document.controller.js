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
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const document_service_1 = require("./document.service");
const download_service_1 = require("./download.service");
const uploadDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const file = req.file;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const { category, documentType, title, isPublic, consent, documentId } = req.body;
    const result = yield document_service_1.DocumentService.uploadDocument(file, {
        category,
        documentType,
        title,
        isPublic: isPublic === 'true' || isPublic === true,
        consent: consent === 'true' || consent === true,
        user: userId,
    }, documentId, userId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Document uploaded successfully!',
        data: result,
    });
}));
const getUserDocuments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const queryUserId = req.query.userId;
    const userId = queryUserId ? queryUserId : (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield document_service_1.DocumentService.getUserDocuments(userId);
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
    const { documentId } = req.params;
    const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason } = req.body;
    const result = yield document_service_1.DocumentService.reviewDocument(documentId, {
        reviewStatus,
        credentialIdNumber,
        credentialIssueDate,
        credentialExpirationDate,
        issuingOrganization,
        rejectionReason,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Document ${reviewStatus} successfully!`,
        data: result,
    });
}));
const getCredentialStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    const result = yield document_service_1.DocumentService.getCredentialStatus(userId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Credential status retrieved successfully!',
        data: result,
    });
}));
const removeCredential = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { documentId } = req.params;
    const result = yield document_service_1.DocumentService.removeCredential(documentId);
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
// SCRUM-67: Get bulk download package info
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
exports.DocumentController = {
    uploadDocument,
    getUserDocuments,
    deleteDocument,
    reviewDocument,
    getCredentialStatus,
    removeCredential,
    downloadDocument,
    getDownloadPackage,
    requestPrivateAccess,
    updatePrivateAccess,
    getAccessRequests,
    getDownloadAuditLog,
};
