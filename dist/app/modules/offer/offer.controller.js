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
exports.OfferController = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const offer_service_1 = require("./offer.service");
const createOrUpdateOffer = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.createOrUpdateOffer(req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer created successfully!',
        data: result,
    });
}));
const uploadOfferDocuments = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.uploadOfferDocuments(req.files, req.params.id, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer documents uploaded successfully!',
        data: result,
    });
}));
const getOffers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.getOffers(req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer created successfully!',
        data: result,
    });
}));
const updateOfferNotes = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.updateOfferNotes(req.params.id, req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer notes updated successfully!',
        data: result,
    });
}));
const deleteOffer = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.deleteOffer(req.params.id, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer deleted successfully!',
        data: result,
    });
}));
const updateOffer = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_service_1.OfferService.updateOffer(req.params.id, req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Offer updated successfully!',
        data: result,
    });
}));
const updateDocumentStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { offerId, documentId, status } = req.body;
    const result = yield offer_service_1.OfferService.updateDocumentStatus(offerId, documentId, status, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Document ${status === 'granted' ? 'access granted' : 'access denied'} successfully!`,
        data: result,
    });
}));
const proRespondToOffer = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const offerId = req.params.id;
    const files = req.files;
    // Status updates are passed as JSON string in form data
    const statusUpdates = req.body.statusUpdates
        ? JSON.parse(req.body.statusUpdates)
        : [];
    const result = yield offer_service_1.OfferService.proRespondToOffer(offerId, files || [], statusUpdates, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Response submitted successfully!',
        data: result,
    });
}));
// SCRUM-141: the agency's Onboard button, and the state its profile bar shows.
const onboardCaregiver = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { onboardCaregiver } = yield Promise.resolve().then(() => __importStar(require('./onboarding.service')));
    const result = yield onboardCaregiver(String((_a = req.user) === null || _a === void 0 ? void 0 : _a._id), req.params.caregiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Caregiver onboarded',
        data: result,
    });
}));
const getOnboardStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { getOnboardSummary } = yield Promise.resolve().then(() => __importStar(require('./onboarding.service')));
    const result = yield getOnboardSummary(String((_a = req.user) === null || _a === void 0 ? void 0 : _a._id), req.params.caregiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Onboard status',
        data: result,
    });
}));
exports.OfferController = {
    onboardCaregiver,
    getOnboardStatus,
    createOrUpdateOffer,
    uploadOfferDocuments,
    getOffers,
    deleteOffer,
    updateOffer,
    updateOfferNotes,
    updateDocumentStatus,
    proRespondToOffer,
};
