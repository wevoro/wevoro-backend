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
exports.runReminders = exports.signItem = exports.myPackets = exports.startPacket = exports.offerContext = exports.restoreDocument = exports.removeDocument = exports.replaceDocument = exports.pendingCopies = exports.addDocuments = exports.getLibrary = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const offer_model_1 = require("../offer/offer.model");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const EsignService = __importStar(require("./esign.service"));
/**
 * The JWT signed at login carries { email, role, _id, status, permissions } —
 * there is no `userId` claim, so reading req.user.userId silently yields
 * undefined and every scoped query comes back empty. `userId` is kept only as a
 * fallback for any token minted by an older code path.
 */
const currentUserId = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId)); };
/** SCRUM-117: the agency Documents page — both groups + counts. */
exports.getLibrary = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield EsignService.getLibrary(currentUserId(req));
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/** SCRUM-117: multi-file upload into one role group. */
exports.addDocuments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const files = (req.files || []);
    if (files.length === 0)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'No files uploaded');
    const result = yield EsignService.addDocuments(currentUserId(req), req.body.role, files);
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
exports.pendingCopies = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield EsignService.pendingCopiesCount(currentUserId(req), req.params.id);
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
exports.replaceDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const file = req.file;
    if (!file)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'No file uploaded');
    const result = yield EsignService.replaceDocument(currentUserId(req), req.params.id, file);
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
exports.removeDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield EsignService.removeDocument(currentUserId(req), req.params.id);
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
exports.restoreDocument = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield EsignService.restoreDocument(currentUserId(req), req.params.id);
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/** SCRUM-118: documents + packet for one offer, caregiver side. */
exports.offerContext = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const caregiverId = currentUserId(req);
    const offer = yield offer_model_1.Offer.findOne({ _id: req.params.offerId, pro: caregiverId }).select('partner');
    if (!offer)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Offer not found');
    const result = yield EsignService.getOfferContext({
        offerId: String(offer._id),
        agencyId: String(offer.partner),
        caregiverId,
    });
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/** SCRUM-118: Step 1 done — snapshot the packet (null when nothing to sign). */
exports.startPacket = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const caregiverId = currentUserId(req);
    const offer = yield offer_model_1.Offer.findOne({ _id: req.params.offerId, pro: caregiverId }).select('partner');
    if (!offer)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Offer not found');
    const result = yield EsignService.startPacket({
        offerId: String(offer._id),
        agencyId: String(offer.partner),
        caregiverId,
    });
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/** SCRUM-118: this caregiver's signing packets, for the signing panel. */
exports.myPackets = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield EsignService.getMyPackets(currentUserId(req));
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/** SCRUM-118: sign one document; completes the packet on the last one. */
exports.signItem = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const result = yield EsignService.signItem({
        packetId: req.params.packetId,
        itemId: req.params.itemId,
        caregiverId: currentUserId(req),
        signatureImage: (_a = req.body) === null || _a === void 0 ? void 0 : _a.signatureImage,
        ip: ((_c = (_b = req.headers['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) || req.ip,
        userAgent: req.headers['user-agent'],
    });
    (0, sendResponse_1.default)(res, { statusCode: http_status_1.default.OK, success: true, data: result });
}));
/**
 * SCRUM-118: reminder cron trigger. Same shape as the SCRUM-102 expiration
 * endpoint: Vercel Cron GETs it with Authorization: Bearer CRON_SECRET; when
 * the secret is unset (local dev) the check is skipped.
 *
 * CADENCE CAVEAT: vercel.json schedules this DAILY because the account is on
 * Vercel's Hobby plan, which rejects any cron running more than once a day
 * (the deploy fails outright). The reminder tiers are hours-based, so on a
 * daily scan a "2 hours after Step 1" reminder actually goes out at the next
 * daily run. To get the tight cadence the client asked for, either move the
 * project to Vercel Pro or point an external scheduler at this endpoint —
 * nothing in the logic needs to change, only how often it is pinged.
 */
const runReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const authHeader = req.headers.authorization || '';
        if (authHeader !== `Bearer ${secret}`) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
    }
    try {
        yield EsignService.runSigningReminders();
        res.status(200).json({ success: true, message: 'Signing reminder scan completed' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.runReminders = runReminders;
