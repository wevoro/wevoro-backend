import httpStatus from 'http-status';
import { Shift } from './shift.model';
import ApiError from '../../../errors/ApiError';

// Helper: parse "10:00 AM" format to 24-hour decimal
function parseTimeTo24(time: string): number {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid time format: "${time}". Expected format: "HH:MM AM/PM"`
    );
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours + minutes / 60;
}

// Calculate shift length (hours) and shift type from start/end times
function calculateShiftDetails(startingTime: string, endingTime: string) {
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

const createShift = async (payload: any, user: any): Promise<any> => {
  payload.partner = user._id;

  // Auto-calculate shiftLength and shiftType
  if (payload.startingTime && payload.endingTime) {
    const { shiftLength, shiftType } = calculateShiftDetails(
      payload.startingTime,
      payload.endingTime
    );
    payload.shiftLength = shiftLength;
    payload.shiftType = shiftType;
  }

  const result = await Shift.create(payload);
  return result;
};

const getShifts = async (partnerId: string, filters: any): Promise<any> => {
  const query: any = { partner: partnerId, status: { $ne: 'removed' } };

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

  const result = await Shift.find(query)
    .populate({
      path: 'assignedCaregivers.caregiver',
      populate: {
        path: 'personalInfo',
        model: 'PersonalInformation',
      },
    })
    .sort({ createdAt: -1 });

  return result;
};

const getShiftById = async (id: string): Promise<any> => {
  const result = await Shift.findById(id).populate({
    path: 'assignedCaregivers.caregiver',
    populate: {
      path: 'personalInfo',
      model: 'PersonalInformation',
    },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }

  return result;
};

const updateShift = async (id: string, payload: any): Promise<any> => {
  // Recalculate shiftLength and shiftType if times are updated
  if (payload.startingTime || payload.endingTime) {
    const shift = await Shift.findById(id);
    if (!shift) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
    }

    const startingTime = payload.startingTime || shift.startingTime;
    const endingTime = payload.endingTime || shift.endingTime;
    const { shiftLength, shiftType } = calculateShiftDetails(
      startingTime,
      endingTime
    );
    payload.shiftLength = shiftLength;
    payload.shiftType = shiftType;
  }

  const result = await Shift.findByIdAndUpdate(id, payload, { new: true });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }

  return result;
};

const updateShiftStatus = async (
  id: string,
  status: string
): Promise<any> => {
  const shift = await Shift.findById(id);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }

  // Validate status transitions
  const validTransitions: Record<string, string[]> = {
    pending: ['upcoming', 'removed'],
    upcoming: ['active', 'removed'],
    active: ['completed', 'removed'],
    completed: [],
    removed: [],
  };

  const allowedNextStatuses = validTransitions[shift.status] || [];
  if (!allowedNextStatuses.includes(status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Cannot transition from "${shift.status}" to "${status}". Allowed transitions: ${allowedNextStatuses.join(', ') || 'none'}`
    );
  }

  shift.status = status;
  await shift.save();

  return shift;
};

const deleteShift = async (id: string): Promise<any> => {
  const result = await Shift.findByIdAndUpdate(
    id,
    { status: 'removed' },
    { new: true }
  );

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }

  return result;
};

const assignCaregiver = async (
  shiftId: string,
  caregiverId: string
): Promise<any> => {
  const shift = await Shift.findById(shiftId);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }

  // Check if caregiver is already assigned
  const alreadyAssigned = shift.assignedCaregivers.some(
    (ac: any) => ac.caregiver?.toString() === caregiverId
  );

  if (alreadyAssigned) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Caregiver is already assigned to this shift'
    );
  }

  shift.assignedCaregivers.push({
    caregiver: caregiverId,
    status: 'pending',
  });

  // If this is the first accepted caregiver, transition to 'upcoming'
  const hasAcceptedCaregiver = shift.assignedCaregivers.some(
    (ac: any) => ac.status === 'accepted'
  );

  if (hasAcceptedCaregiver && shift.status === 'pending') {
    shift.status = 'upcoming';
  }

  await shift.save();

  // Return populated result
  const result = await Shift.findById(shiftId).populate({
    path: 'assignedCaregivers.caregiver',
    populate: {
      path: 'personalInfo',
      model: 'PersonalInformation',
    },
  });

  return result;
};

export const ShiftService = {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  updateShiftStatus,
  deleteShift,
  assignCaregiver,
};
