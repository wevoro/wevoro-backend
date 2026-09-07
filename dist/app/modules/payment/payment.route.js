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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const PaymentController = __importStar(require("./payment.controller"));
const router = express_1.default.Router();
// --- SCRUM-115 ---
// NOTE: the webhook is NOT mounted here. It needs the raw request body for
// signature verification, and this router sits behind the global
// express.json() in app.ts. It is mounted directly in app.ts, above that
// parser, at /api/v1/payment/webhook.
router.get('/packet/:caregiverId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), PaymentController.packetStatus);
router.post('/checkout/:caregiverId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), PaymentController.checkout);
router.get('/my-transactions', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), PaymentController.myTransactions);
// QA only. The service refuses this outright once Stripe is configured.
router.post('/simulate/:transactionId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), PaymentController.simulate);
exports.PaymentRoutes = router;
