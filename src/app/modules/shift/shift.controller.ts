import { Request, RequestHandler, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { ShiftService } from './shift.service';

const createShift: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.createShift(req.body, req.user);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Shift created successfully!',
      data: result,
    });
  }
);

const getShifts: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const filters = {
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const result = await ShiftService.getShifts(user._id, filters);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Shifts retrieved successfully!',
      data: result,
    });
  }
);

const getShiftById: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.getShiftById(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Shift retrieved successfully!',
      data: result,
    });
  }
);

const updateShift: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.updateShift(req.params.id, req.body);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Shift updated successfully!',
      data: result,
    });
  }
);

const updateShiftStatus: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.updateShiftStatus(
      req.params.id,
      req.body.status
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Shift status updated successfully!',
      data: result,
    });
  }
);

const deleteShift: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.deleteShift(req.params.id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Shift deleted successfully!',
      data: result,
    });
  }
);

const assignCaregiver: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ShiftService.assignCaregiver(
      req.params.id,
      req.body.caregiverId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Caregiver assigned successfully!',
      data: result,
    });
  }
);

export const ShiftController = {
  createShift,
  getShifts,
  getShiftById,
  updateShift,
  updateShiftStatus,
  deleteShift,
  assignCaregiver,
};
