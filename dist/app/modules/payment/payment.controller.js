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
exports.myTransactions = exports.simulate = exports.confirm = exports.webhook = exports.checkout = exports.packetStatus = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const PaymentService = __importStar(require("./payment.service"));
/** The JWT carries `_id`, not `userId`. */
const currentUserId = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) || ''); };
/** What a packet costs and whether this agency already owns it. */
exports.packetStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield PaymentService.getPacketStatus({
        agencyId: currentUserId(req),
        caregiverId: req.params.caregiverId,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Packet status retrieved successfully',
        data: result,
    });
}));
/** Open (or resume) a purchase. Returns a Stripe client secret when live. */
exports.checkout = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield PaymentService.createCheckout({
        agencyId: currentUserId(req),
        caregiverId: req.params.caregiverId,
        returnOrigin: (_a = req.body) === null || _a === void 0 ? void 0 : _a.returnOrigin,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Checkout ready',
        data: result,
    });
}));
/**
 * Stripe webhook. Mounted with a raw body parser, because a parsed body cannot
 * be signature-verified.
 *
 * Deliberately NOT wrapped in catchAsync: Stripe retries any non-2xx, so the
 * response shape matters more than the error handler's. A signature failure is
 * a real 400 (do not retry a forged payload); anything else is acknowledged so
 * Stripe does not redeliver an event we have already recorded.
 */
const webhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
        return;
    }
    try {
        const result = yield PaymentService.handleWebhook(req.body, signature);
        res.status(200).json(result);
    }
    catch (err) {
        const isSignature = /signature/i.test((err === null || err === void 0 ? void 0 : err.message) || '');
        if (isSignature) {
            res.status(400).json({ success: false, message: err.message });
            return;
        }
        console.error('[payment] webhook handling failed:', err === null || err === void 0 ? void 0 : err.message);
        // Acknowledge so Stripe stops retrying; the failure is ours to fix, and a
        // retry storm would not help.
        res.status(200).json({ received: true, handled: false });
    }
});
exports.webhook = webhook;
/**
 * Reconcile a transaction against Stripe. The webhook remains the primary
 * signal; this covers the window before a webhook arrives, and the case where
 * one never does.
 */
exports.confirm = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield PaymentService.confirmFromStripe({
        transactionId: req.params.transactionId,
        agencyId: currentUserId(req),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Transaction reconciled',
        data: result,
    });
}));
/** QA-only: drive a simulated payment to success or failure. */
exports.simulate = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const outcome = (_a = req.body) === null || _a === void 0 ? void 0 : _a.outcome;
    if (outcome !== 'succeed' && outcome !== 'fail') {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "outcome must be 'succeed' or 'fail'");
    }
    const result = yield PaymentService.simulate({
        transactionId: req.params.transactionId,
        outcome,
        agencyId: currentUserId(req),
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Payment ${outcome === 'succeed' ? 'succeeded' : 'failed'}`,
        data: result,
    });
}));
/** The agency's purchases, for receipts and re-download. */
exports.myTransactions = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield PaymentService.getMyTransactions(currentUserId(req));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Transactions retrieved successfully',
        data: result,
    });
}));
