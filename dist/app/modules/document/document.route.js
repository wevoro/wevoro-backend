"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const document_controller_1 = require("./document.controller");
const multer_1 = __importDefault(require("multer"));
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({});
const upload = (0, multer_1.default)({ storage });
// Upload a new document
router.post('/upload', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.single('file'), document_controller_1.DocumentController.uploadDocument);
// Get all documents for the authenticated user
router.get('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), document_controller_1.DocumentController.getUserDocuments);
// Delete a specific document
router.delete('/:documentId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), document_controller_1.DocumentController.deleteDocument);
// Admin: review (approve/reject) a document
router.patch('/:documentId/review', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), document_controller_1.DocumentController.reviewDocument);
// Get credential status for a user (public for agency view)
router.get('/credentials/:userId', document_controller_1.DocumentController.getCredentialStatus);
// Remove a credential (pro only)
router.delete('/:documentId/remove-credential', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), document_controller_1.DocumentController.removeCredential);
// SCRUM-67: Download a single document (partner auth)
router.get('/download/:documentId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), document_controller_1.DocumentController.downloadDocument);
// SCRUM-67: Get bulk download package (partner auth)
router.get('/download-package/:caregiverUserId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), document_controller_1.DocumentController.getDownloadPackage);
// SCRUM-67: Request private document access (partner auth)
router.post('/request-private-access/:caregiverUserId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), document_controller_1.DocumentController.requestPrivateAccess);
// SCRUM-67: Grant or revoke private access (pro auth)
router.patch('/private-access/:accessId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), document_controller_1.DocumentController.updatePrivateAccess);
// SCRUM-67: Get access requests for caregiver (pro auth)
router.get('/access-requests', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), document_controller_1.DocumentController.getAccessRequests);
// SCRUM-67: Get download audit log (admin auth)
router.get('/download-audit/:caregiverUserId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), document_controller_1.DocumentController.getDownloadAuditLog);
exports.DocumentRoutes = router;
