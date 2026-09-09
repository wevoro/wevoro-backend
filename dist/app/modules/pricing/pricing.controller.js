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
exports.getCurrentPrice = exports.updatePrice = exports.getOverview = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const PricingService = __importStar(require("./pricing.service"));
/**
 * SCRUM-113: founder-only pricing administration.
 *
 * The JWT carries `_id`, not `userId` — reading `req.user.userId` yields
 * undefined and every ownership query silently returns nothing.
 */
const currentUserId = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) || ''); };
exports.getOverview = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield PricingService.getOverview({
        search: req.query.search,
        status: req.query.status,
        sort: req.query.sort,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Pricing overview retrieved successfully',
        data: result,
    });
}));
exports.updatePrice = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { newPriceCents, newPrice, reason } = req.body || {};
    // Accept either cents or a dollar amount, because the admin form works in
    // dollars while everything downstream — including Stripe — works in cents.
    let cents;
    if (newPriceCents !== undefined && newPriceCents !== null && newPriceCents !== '') {
        cents = Math.round(Number(newPriceCents));
    }
    else if (newPrice !== undefined && newPrice !== null && newPrice !== '') {
        cents = Math.round(Number(newPrice) * 100);
    }
    else {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'A new price is required');
    }
    if (!Number.isFinite(cents)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Enter a valid price');
    }
    const result = yield PricingService.updatePrice({
        newPriceCents: cents,
        reason,
        changedBy: currentUserId(req),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Price updated successfully',
        data: result,
    });
}));
/**
 * The current price, readable by an agency so the paywall can show what a
 * packet costs before the payment gate opens. Read-only, and deliberately
 * exposes nothing but the price.
 */
exports.getCurrentPrice = (0, catchAsync_1.default)((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const priceCents = yield PricingService.getCurrentPriceCents();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Current price retrieved successfully',
        data: { priceCents, currency: 'usd' },
    });
}));
