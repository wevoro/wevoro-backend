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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackService = void 0;
const cloudinary_1 = __importDefault(require("cloudinary"));
const http_status_1 = __importDefault(require("http-status"));
const config_1 = __importDefault(require("../../../config"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const sendMail_1 = require("../auth/sendMail");
const feedback_model_1 = require("./feedback.model");
cloudinary_1.default.v2.config({
    cloud_name: config_1.default.cloudinary.cloud_name,
    api_key: config_1.default.cloudinary.api_key,
    api_secret: config_1.default.cloudinary.api_secret,
});
/**
 * SCRUM-201: the screenshot arrives as a data URI in the JSON body, the way
 * the feedback widget already sends everything else, so nothing about the
 * public /feedback route changes shape.
 *
 * This route takes no token — anyone on the internet can post to it — so the
 * picture is checked here before it goes anywhere: an image only, and small
 * enough that a 50mb body cannot be used to fill the Cloudinary account. The
 * widget already shrinks what it sends to about 1600px wide, so a real
 * screenshot lands far under this.
 */
const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;
const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const storeScreenshot = (dataUri) => __awaiter(void 0, void 0, void 0, function* () {
    if (!IMAGE_DATA_URI.test(dataUri)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'The screenshot must be a PNG, JPEG, WebP or GIF image.');
    }
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    if (Buffer.byteLength(base64, 'base64') > MAX_SCREENSHOT_BYTES) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'That screenshot is too large. Please send one under 6 MB.');
    }
    const cloudRes = yield cloudinary_1.default.v2.uploader.upload(dataUri, {
        upload_preset: 'wevoro',
        resource_type: 'image',
    });
    return cloudRes.secure_url;
});
const createFeedback = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = payload || {}, { screenshot } = _a, rest = __rest(_a, ["screenshot"]);
    const body = Object.assign({}, rest);
    if (typeof screenshot === 'string' && screenshot.trim()) {
        body.screenshot = yield storeScreenshot(screenshot.trim());
    }
    const feedback = yield feedback_model_1.Feedback.create(body);
    return feedback;
});
const updateFeedback = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const feedback = yield feedback_model_1.Feedback.findByIdAndUpdate(id, payload, { new: true });
    if (!feedback) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Feedback not found');
    }
    return feedback;
});
const deleteFeedback = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const feedback = yield feedback_model_1.Feedback.findByIdAndDelete(id);
    if (!feedback) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Feedback not found');
    }
    return feedback;
});
const getAllFeedback = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield feedback_model_1.Feedback.find().sort({ createdAt: -1 });
    return result;
});
const getFeedbackById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const feedback = yield feedback_model_1.Feedback.findById(id);
    if (!feedback) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Feedback not found');
    }
    return feedback;
});
const sendReply = (_a) => __awaiter(void 0, [_a], void 0, function* ({ message, email }) {
    const result = yield (0, sendMail_1.sendEmail)(email, 'Reply to your feedback', message);
    return result;
});
exports.FeedbackService = {
    createFeedback,
    updateFeedback,
    deleteFeedback,
    getAllFeedback,
    getFeedbackById,
    sendReply
};
