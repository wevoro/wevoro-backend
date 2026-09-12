import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import ApiError from '../../../errors/ApiError';
import * as PaymentService from './payment.service';

/** The JWT carries `_id`, not `userId`. */
const currentUserId = (req: Request): string =>
  String((req.user as any)?._id || (req.user as any)?.userId || '');

/** What a packet costs and whether this agency already owns it. */
export const packetStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getPacketStatus({
    agencyId: currentUserId(req),
    caregiverId: req.params.caregiverId,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Packet status retrieved successfully',
    data: result,
  });
});

/** Open (or resume) a purchase. Returns a Stripe client secret when live. */
export const checkout = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.createCheckout({
    agencyId: currentUserId(req),
    caregiverId: req.params.caregiverId,
    returnOrigin: req.body?.returnOrigin,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Checkout ready',
    data: result,
  });
});

/**
 * Stripe webhook. Mounted with a raw body parser, because a parsed body cannot
 * be signature-verified.
 *
 * Deliberately NOT wrapped in catchAsync: Stripe retries any non-2xx, so the
 * response shape matters more than the error handler's. A signature failure is
 * a real 400 (do not retry a forged payload); anything else is acknowledged so
 * Stripe does not redeliver an event we have already recorded.
 */
export const webhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'] as string;
  if (!signature) {
    res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
    return;
  }
  try {
    const result = await PaymentService.handleWebhook(req.body as Buffer, signature);
    res.status(200).json(result);
  } catch (err: any) {
    const isSignature = /signature/i.test(err?.message || '');
    if (isSignature) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('[payment] webhook handling failed:', err?.message);
    // Acknowledge so Stripe stops retrying; the failure is ours to fix, and a
    // retry storm would not help.
    res.status(200).json({ received: true, handled: false });
  }
};

/**
 * Reconcile a transaction against Stripe. The webhook remains the primary
 * signal; this covers the window before a webhook arrives, and the case where
 * one never does.
 */
export const confirm = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.confirmFromStripe({
    transactionId: req.params.transactionId,
    agencyId: currentUserId(req),
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Transaction reconciled',
    data: result,
  });
});

/** QA-only: drive a simulated payment to success or failure. */
export const simulate = catchAsync(async (req: Request, res: Response) => {
  const outcome = req.body?.outcome;
  if (outcome !== 'succeed' && outcome !== 'fail') {
    throw new ApiError(httpStatus.BAD_REQUEST, "outcome must be 'succeed' or 'fail'");
  }
  const result = await PaymentService.simulate({
    transactionId: req.params.transactionId,
    outcome,
    agencyId: currentUserId(req),
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Payment ${outcome === 'succeed' ? 'succeeded' : 'failed'}`,
    data: result,
  });
});

/** The agency's purchases, for receipts and re-download. */
export const myTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getMyTransactions(currentUserId(req));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Transactions retrieved successfully',
    data: result,
  });
});
