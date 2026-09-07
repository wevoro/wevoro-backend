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
exports.PricingRoutes = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const PricingController = __importStar(require("./pricing.controller"));
const router = express_1.default.Router();
// --- SCRUM-113: founder-only pricing administration ---
// auth(ADMIN) already admits super_admin — the middleware lets SUPER_ADMIN
// through before the role check runs — so this is the founder/admin gate.
router.get('/admin/overview', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), PricingController.getOverview);
router.patch('/admin/price', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), PricingController.updatePrice);
// --- Read-only price, for the agency paywall ---
// An agency needs to see what a packet costs before opening the payment gate.
router.get('/current', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), PricingController.getCurrentPrice);
exports.PricingRoutes = router;
