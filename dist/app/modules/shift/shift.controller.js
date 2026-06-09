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
exports.ShiftController = void 0;
const catchAsync_1 = __importDefault(require("../../../shared/catchAsync"));
const sendResponse_1 = __importDefault(require("../../../shared/sendResponse"));
const http_status_1 = __importDefault(require("http-status"));
const shift_service_1 = require("./shift.service");
const createShift = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.createShift(req.body, req.user);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Shift created successfully!',
        data: result,
    });
}));
const getShifts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = req.user;
    const filters = {
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
    };
    const result = yield shift_service_1.ShiftService.getShifts(user._id, filters);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Shifts retrieved successfully!',
        data: result,
    });
}));
const getShiftById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.getShiftById(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Shift retrieved successfully!',
        data: result,
    });
}));
const updateShift = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.updateShift(req.params.id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Shift updated successfully!',
        data: result,
    });
}));
const updateShiftStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.updateShiftStatus(req.params.id, req.body.status);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Shift status updated successfully!',
        data: result,
    });
}));
const deleteShift = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.deleteShift(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Shift deleted successfully!',
        data: result,
    });
}));
const assignCaregiver = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_service_1.ShiftService.assignCaregiver(req.params.id, req.body.caregiverId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Caregiver assigned successfully!',
        data: result,
    });
}));
exports.ShiftController = {
    createShift,
    getShifts,
    getShiftById,
    updateShift,
    updateShiftStatus,
    deleteShift,
    assignCaregiver,
};
