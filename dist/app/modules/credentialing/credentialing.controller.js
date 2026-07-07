"use strict";
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
exports.CredentialingController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const credentialing_service_1 = require("./credentialing.service");
/**
 * SCRUM-87: caregiver's repurposed Offers tab — Submitted/Received agency
 * engagements for the authenticated caregiver.
 */
const getCaregiverEngagements = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const caregiverId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield credentialing_service_1.CredentialingService.getCaregiverEngagements(caregiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Caregiver engagements retrieved successfully!',
        data: result,
    });
}));
/**
 * SCRUM-88: agency's repurposed Offers tab — Submitted/Received caregiver
 * engagements for the authenticated agency.
 */
const getAgencyEngagements = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const agencyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
    const result = yield credentialing_service_1.CredentialingService.getAgencyEngagements(agencyId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Agency engagements retrieved successfully!',
        data: result,
    });
}));
exports.CredentialingController = {
    getCaregiverEngagements,
    getAgencyEngagements,
};
