"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerVerificationRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const partner_verification_controller_1 = require("./partner-verification.controller");
const multer_1 = __importDefault(require("multer"));
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({});
const upload = (0, multer_1.default)({ storage });
// Create or Update verification
router.post('/verify', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), upload.single('file'), partner_verification_controller_1.PartnerVerificationController.verifyPartner);
// Get verification status
router.get('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), partner_verification_controller_1.PartnerVerificationController.getPartnerVerification);
exports.PartnerVerificationRoutes = router;
