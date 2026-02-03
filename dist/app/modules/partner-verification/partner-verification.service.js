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
exports.PartnerVerificationService = void 0;
const partner_verification_model_1 = require("./partner-verification.model");
const user_model_1 = require("../user/user.model");
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const verifyPartner = (file, payload) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('🚀 ~ verifyPartner ~ payload:', payload);
    // Check if a verification document already exists for this user
    const existingVerification = yield partner_verification_model_1.PartnerVerification.findOne({
        partner: payload.user,
    });
    // File is required if creating new or if updating and no existing file (though logic implies simplified flow)
    // For this flow: always require file if no existing document. If existing, file is optional (update).
    if (!existingVerification && !file) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'License file is required');
    }
    // Upload file to Bunny CDN if provided
    let fileUrl;
    if (file) {
        fileUrl = yield (0, bunny_upload_1.uploadFile)(file);
    }
    // Build the data object
    const verificationData = {
        licenseNumber: payload.licenseNumber,
        ein: payload.ein,
        partner: payload.user,
    };
    if (fileUrl) {
        verificationData.licenseFile = fileUrl;
    }
    let result;
    if (existingVerification) {
        // Update existing document
        result = yield partner_verification_model_1.PartnerVerification.findOneAndUpdate({ partner: payload.user }, verificationData, {
            new: true,
        });
    }
    else {
        // Create new document
        result = yield partner_verification_model_1.PartnerVerification.create(verificationData);
    }
    // Update user status to in-review
    yield user_model_1.User.findByIdAndUpdate(payload.user, { status: 'in-review' });
    return result;
});
const getPartnerVerification = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield partner_verification_model_1.PartnerVerification.findOne({ partner: userId });
    return result;
});
exports.PartnerVerificationService = {
    verifyPartner,
    getPartnerVerification,
};
