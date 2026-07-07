"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialingRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const credentialing_controller_1 = require("./credentialing.controller");
const router = express_1.default.Router();
// SCRUM-87: caregiver's credentialing-mode Offers tab (Submitted/Received).
router.get('/caregiver-engagements', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), credentialing_controller_1.CredentialingController.getCaregiverEngagements);
// SCRUM-88: agency's credentialing-mode Offers tab (Submitted/Received).
router.get('/agency-engagements', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), credentialing_controller_1.CredentialingController.getAgencyEngagements);
exports.CredentialingRoutes = router;
