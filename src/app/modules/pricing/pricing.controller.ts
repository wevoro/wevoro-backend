import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import ApiError from '../../../errors/ApiError';
import * as PricingService from './pricing.service';

/**
 * SCRUM-113: founder-only pricing administration.
 *
 * The JWT carries `_id`, not `userId` — reading `req.user.userId` yields
 * undefined and every ownership query silently returns nothing.
 */
const currentUserId = (req: Request): string =>
  String((req.user as any)?._id || (req.user as any)?.userId || '');

export const getOverview = catchAsync(async (req: Request, res: Response) => {
  const result = await PricingService.getOverview({
    search: req.query.search as string,
    status: req.query.status as string,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pricing overview retrieved successfully',
    data: result,
  });
});

export const updatePrice = catchAsync(async (req: Request, res: Response) => {
  const { newPriceCents, newPrice, reason } = req.body || {};

  // Accept either cents or a dollar amount, because the admin form works in
  // dollars while everything downstream — including Stripe — works in cents.
  let cents: number;
  if (newPriceCents !== undefined && newPriceCents !== null && newPriceCents !== '') {
    cents = Math.round(Number(newPriceCents));
  } else if (newPrice !== undefined && newPrice !== null && newPrice !== '') {
    cents = Math.round(Number(newPrice) * 100);
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A new price is required');
  }

  if (!Number.isFinite(cents)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a valid price');
  }

  const result = await PricingService.updatePrice({
    newPriceCents: cents,
    reason,
    changedBy: currentUserId(req),
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Price updated successfully',
    data: result,
  });
});

/**
 * The current price, readable by an agency so the paywall can show what a
 * packet costs before the payment gate opens. Read-only, and deliberately
 * exposes nothing but the price.
 */
export const getCurrentPrice = catchAsync(async (_req: Request, res: Response) => {
  const priceCents = await PricingService.getCurrentPriceCents();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Current price retrieved successfully',
    data: { priceCents, currency: 'usd' },
  });
});
