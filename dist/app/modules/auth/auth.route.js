"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const auth_controller_1 = require("./auth.controller");
const router = express_1.default.Router();
router.post('/login', auth_controller_1.AuthController.loginUser);
// SCRUM-99: passwordless agency login (email + emailed code)
router.post('/request-code', auth_controller_1.AuthController.requestLoginCode);
router.post('/verify-code', auth_controller_1.AuthController.verifyLoginCode);
router.post('/google', auth_controller_1.AuthController.loginWithGoogle);
router.post('/refresh-token', auth_controller_1.AuthController.refreshToken);
router.post('/change-password', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO), auth_controller_1.AuthController.changePassword);
router.post('/forgot-password', auth_controller_1.AuthController.forgotPass);
router.post('/verify-otp', auth_controller_1.AuthController.verifyOtp);
router.post('/reset-password', auth_controller_1.AuthController.resetPassword);
exports.AuthRoutes = router;
