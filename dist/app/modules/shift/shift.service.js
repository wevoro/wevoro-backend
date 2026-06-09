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
exports.ShiftService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const shift_model_1 = require("./shift.model");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
// Helper: parse "10:00 AM" format to 24-hour decimal
function parseTimeTo24(time) {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid time format: "${time}". Expected format: "HH:MM AM/PM"`);
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) {
        hours += 12;
    }
    else if (period === 'AM' && hours === 12) {
        hours = 0;
    }
    return hours + minutes / 60;
}
// Calculate shift length (hours) and shift type from start/end times
function calculateShiftDetails(startingTime, endingTime) {
    const startHour = parseTimeTo24(startingTime);
    const endHour = parseTimeTo24(endingTime);
    // Calculate duration, handling overnight shifts
    let shiftLength = endHour - startHour;
    if (shiftLength <= 0) {
        shiftLength += 24;
    }
    // Night Shift: starting time between 7PM (19) and 5AM (5)
    const isNightShift = startHour >= 19 || startHour < 5;
    const shiftType = isNightShift ? 'Night Shift' : 'Day Shift';
    return { shiftLength, shiftType };
}
const createShift = (payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    payload.partner = user._id;
    // Auto-calculate shiftLength and shiftType
    if (payload.startingTime && payload.endingTime) {
        const { shiftLength, shiftType } = calculateShiftDetails(payload.startingTime, payload.endingTime);
        payload.shiftLength = shiftLength;
        payload.shiftType = shiftType;
    }
    const result = yield shift_model_1.Shift.create(payload);
    return result;
});
const getShifts = (partnerId, filters) => __awaiter(void 0, void 0, void 0, function* () {
    const query = { partner: partnerId, status: { $ne: 'removed' } };
    // Filter by status
    if (filters.status) {
        query.status = filters.status;
    }
    // Filter by date range
    if (filters.startDate || filters.endDate) {
        query.startingDate = {};
        if (filters.startDate) {
            query.startingDate.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
            query.startingDate.$lte = new Date(filters.endDate);
        }
    }
    const result = yield shift_model_1.Shift.find(query)
        .populate({
        path: 'assignedCaregivers.caregiver',
        populate: {
            path: 'personalInfo',
            model: 'PersonalInformation',
        },
    })
        .sort({ createdAt: -1 });
    return result;
});
const getShiftById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_model_1.Shift.findById(id).populate({
        path: 'assignedCaregivers.caregiver',
        populate: {
            path: 'personalInfo',
            model: 'PersonalInformation',
        },
    });
    if (!result) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
    }
    return result;
});
const updateShift = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    // Recalculate shiftLength and shiftType if times are updated
    if (payload.startingTime || payload.endingTime) {
        const shift = yield shift_model_1.Shift.findById(id);
        if (!shift) {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
        }
        const startingTime = payload.startingTime || shift.startingTime;
        const endingTime = payload.endingTime || shift.endingTime;
        const { shiftLength, shiftType } = calculateShiftDetails(startingTime, endingTime);
        payload.shiftLength = shiftLength;
        payload.shiftType = shiftType;
    }
    const result = yield shift_model_1.Shift.findByIdAndUpdate(id, payload, { new: true });
    if (!result) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
    }
    return result;
});
const updateShiftStatus = (id, status) => __awaiter(void 0, void 0, void 0, function* () {
    const shift = yield shift_model_1.Shift.findById(id);
    if (!shift) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
    }
    // Validate status transitions
    const validTransitions = {
        pending: ['upcoming', 'removed'],
        upcoming: ['active', 'removed'],
        active: ['completed', 'removed'],
        completed: [],
        removed: [],
    };
    const allowedNextStatuses = validTransitions[shift.status] || [];
    if (!allowedNextStatuses.includes(status)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot transition from "${shift.status}" to "${status}". Allowed transitions: ${allowedNextStatuses.join(', ') || 'none'}`);
    }
    shift.status = status;
    yield shift.save();
    return shift;
});
const deleteShift = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield shift_model_1.Shift.findByIdAndUpdate(id, { status: 'removed' }, { new: true });
    if (!result) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
    }
    return result;
});
const assignCaregiver = (shiftId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const shift = yield shift_model_1.Shift.findById(shiftId);
    if (!shift) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Shift not found');
    }
    // Check if caregiver is already assigned
    const alreadyAssigned = shift.assignedCaregivers.some((ac) => { var _a; return ((_a = ac.caregiver) === null || _a === void 0 ? void 0 : _a.toString()) === caregiverId; });
    if (alreadyAssigned) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Caregiver is already assigned to this shift');
    }
    shift.assignedCaregivers.push({
        caregiver: caregiverId,
        status: 'pending',
    });
    // If this is the first accepted caregiver, transition to 'upcoming'
    const hasAcceptedCaregiver = shift.assignedCaregivers.some((ac) => ac.status === 'accepted');
    if (hasAcceptedCaregiver && shift.status === 'pending') {
        shift.status = 'upcoming';
    }
    yield shift.save();
    // Return populated result
    const result = yield shift_model_1.Shift.findById(shiftId).populate({
        path: 'assignedCaregivers.caregiver',
        populate: {
            path: 'personalInfo',
            model: 'PersonalInformation',
        },
    });
    return result;
});
exports.ShiftService = {
    createShift,
    getShifts,
    getShiftById,
    updateShift,
    updateShiftStatus,
    deleteShift,
    assignCaregiver,
};
