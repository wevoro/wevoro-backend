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
exports.DocumentRoutes = router;
