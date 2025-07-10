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
exports.FeedbackService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const sendMail_1 = require("../auth/sendMail");
const feedback_model_1 = require("./feedback.model");
const createFeedback = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const feedback = yield feedback_model_1.Feedback.create(payload);
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
