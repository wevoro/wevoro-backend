import httpStatus from 'http-status';
import Stripe from 'stripe';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { PacketTransaction } from '../pricing/pricing.model';
import { getCurrentPriceCents } from '../pricing/pricing.service';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { Documents } from '../document/documents.model';
import { User } from '../user/user.model';
import { ENUM_USER_ROLE } from '../../../enums/user';

/**
 * SCRUM-115: Stripe payments for credential packets.
 *
 * Three rules drive the whole module:
 *
 *  1. Delivery is gated on the WEBHOOK, never on the client saying it paid.
 *     A browser can claim anything; only Stripe's signed event is evidence.
 *  2. Entitlement is per (agency, caregiver) pair and permanent. A second
 *     download must never create a second charge.
 *  3. price_charged is locked onto the transaction when the intent is created
 *     and never recalculated, so a later price change cannot rewrite history.
 *
 * Payment is deliberately independent of e-signature status (AC #6) — nothing
 * here reads or waits on a signature packet.
 */

const stripeClient = (): Stripe | null => {
  const key = config.stripe.secret_key;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2025-10-29.clover' as any });
};

/**
 * Where Stripe sends the agency back after checkout. Deliberately NOT
 * config.frontend_url — that value is a leftover pointing at a different
 * product. Same APP_PUBLIC_URL the credential emails use.
 */
const appUrl = (): string =>
  (process.env.APP_PUBLIC_URL || 'https://wevoro.com').replace(/\/+$/, '');

/**
 * True when a real Stripe charge can be made. When false the module either
 * refuses (production) or simulates (QA with PAYMENTS_TEST_MODE=true).
 */
export const isStripeConfigured = (): boolean => !!config.stripe.secret_key;

/**
 * The simulated path exists so QA can exercise every state before credentials
 * arrive. It requires BOTH the explicit opt-in AND no real Stripe key, so
 * configuring Stripe automatically disables it.
 */
const isTestMode = (): boolean => config.payments_test_mode && !isStripeConfigured();

const displayName = async (userId: string): Promise<string> => {
  const info = await PersonalInfo.findOne({ user: userId }).select(
    'firstName lastName companyName'
  );
  const person = `${info?.firstName || ''} ${info?.lastName || ''}`.trim();
  return (info as any)?.companyName || person || 'A WeVoro user';
};

/** The paid entitlement for this pair, if one exists. */
export const findEntitlement = async (agencyId: string, caregiverId: string) =>
  PacketTransaction.findOne({
    agency: agencyId,
    caregiver: caregiverId,
    status: 'paid',
  });

/** Has this agency already paid for this caregiver's packet? */
export const hasEntitlement = async (
  agencyId: string,
  caregiverId: string
): Promise<boolean> => !!(await findEntitlement(agencyId, caregiverId));

/**
 * What the agency should see before paying: the price, whether they already own
 * this packet, and how many files it holds.
 *
 * Never gated on e-signature — a caregiver mid-signature must not block a sale.
 */
export const getPacketStatus = async (params: {
  agencyId: string;
  caregiverId: string;
}) => {
  const { agencyId, caregiverId } = params;
  const [priceCents, entitlement, caregiverName, info, prof] = await Promise.all([
    getCurrentPriceCents(),
    findEntitlement(agencyId, caregiverId),
    displayName(caregiverId),
    // The payment screen shows the caregiver's photo, role and city so the
    // agency can see who they are paying for. Sourced here rather than passed
    // in by each caller, so every surface that opens the gate shows the same
    // thing instead of a half-filled card.
    PersonalInfo.findOne({ user: caregiverId }).select('image address'),
    ProfessionalInfo.findOne({ user: caregiverId }).select('role'),
  ]);

  // The design shows "{name} · N files" under the packet line, so the agency
  // knows how much they are getting before paying. Counted here rather than
  // left to the manifest call, because the gate can be opened without the
  // documents modal ever being loaded.
  //
  // SCRUM-99: counted from the same visible set the manifest shows and the
  // download actually releases. A raw count ignored the sensitive-credential
  // tier gate, so an un-Confirmed agency was quoted files it would never
  // receive — "4 files" on the buy screen, 2 in the delivered package.
  const allDocs = await Documents.find({
    user: caregiverId,
    url: { $exists: true, $nin: [null, ''] },
  });
  const { filterVisibleDocuments } = await import(
    '../document/credential-visibility'
  );
  const fileCount = (await filterVisibleDocuments(allDocs, agencyId, caregiverId))
    .length;

  const city = (info as any)?.address?.city;
  const state = (info as any)?.address?.state;

  return {
    caregiverId,
    caregiverName,
    caregiverImage: (info as any)?.image || null,
    caregiverRole: (prof as any)?.role || null,
    caregiverLocation: [city, state].filter(Boolean).join(', ') || null,
    fileCount,
    // A paid packet keeps the price it was bought at, not today's price.
    priceCents: entitlement ? entitlement.priceChargedCents : priceCents,
    currency: 'usd',
    paid: !!entitlement,
    paidAt: entitlement?.paidAt ?? null,
    transactionId: entitlement?._id ?? null,
    stripeConfigured: isStripeConfigured(),
    testMode: isTestMode(),
  };
};

/**
 * Start (or resume) a purchase.
 *
 * Idempotent in three ways, which together satisfy "never double-charge":
 *  - an existing PAID row short-circuits and charges nothing;
 *  - an existing PENDING row reuses its PaymentIntent rather than creating a
 *    second one, so a refreshed browser does not open two charges;
 *  - the price is read once and frozen onto the row.
 */
export const createCheckout = async (params: {
  agencyId: string;
  caregiverId: string;
}) => {
  const { agencyId, caregiverId } = params;

  // A packet is a caregiver's credentials. Anything else — another agency, an
  // admin — is not a purchasable product: buying one wrote a nonsense row into
  // the founder's ledger and granted a permanent download entitlement over an
  // account that sells nothing. The message is deliberately unchanged so the
  // endpoint does not confirm which ids are real accounts.
  const caregiver = await User.findById(caregiverId).select('_id role');
  if (!caregiver || caregiver.role !== ENUM_USER_ROLE.PRO) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Caregiver not found');
  }

  // Rule 2: already owned — no Stripe call, no new transaction.
  const owned = await findEntitlement(agencyId, caregiverId);
  if (owned) {
    return {
      alreadyPaid: true,
      transactionId: String(owned._id),
      priceCents: owned.priceChargedCents,
      currency: owned.currency,
      clientSecret: null,
      testMode: isTestMode(),
    };
  }

  const priceCents = await getCurrentPriceCents();

  // Reuse an unfinished attempt rather than stacking intents.
  let transaction = await PacketTransaction.findOne({
    agency: agencyId,
    caregiver: caregiverId,
    status: { $in: ['pending', 'failed'] },
  }).sort({ createdAt: -1 });

  if (!transaction) {
    transaction = await PacketTransaction.create({
      agency: agencyId,
      caregiver: caregiverId,
      // Rule 3: locked here, never recomputed.
      priceChargedCents: priceCents,
      currency: 'usd',
      status: 'pending',
      transactionDate: new Date(),
    });
  } else if (transaction.priceChargedCents !== priceCents) {
    // "Locked, never recomputed" is right for a transaction that was PAID —
    // the ledger must not rewrite what an agency was actually charged. It is
    // wrong for one that never completed. An abandoned attempt from before a
    // price change kept quoting the old amount forever: the admin page said
    // $49.99 while this gate charged $60.00, and an agency sitting on a stale
    // pending row could also keep buying at a price the founder had already
    // raised. Nothing was charged for a pending/failed row, so re-price it to
    // what the packet costs today. Paid rows never reach here — they return
    // above through `owned`.
    transaction.priceChargedCents = priceCents;
    // The Stripe intent below carries an amount. Drop the stale one so a new
    // intent is minted for the new price instead of confirming the old total.
    transaction.stripePaymentIntentId = undefined;
    await transaction.save();
  }

  if (isTestMode()) {
    // No Stripe. The client drives the state machine through /simulate.
    transaction.status = 'pending';
    transaction.failureMessage = undefined;
    await transaction.save();
    return {
      alreadyPaid: false,
      transactionId: String(transaction._id),
      priceCents: transaction.priceChargedCents,
      currency: transaction.currency,
      clientSecret: null,
      testMode: true,
    };
  }

  const stripe = stripeClient();
  if (!stripe) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Payments are not configured yet. Please try again later.'
    );
  }

  // Reuse an open session so a retry does not stack checkout pages, and so
  // returning to the gate lands the agency back on the page they left.
  let session: Stripe.Checkout.Session | null = null;
  if (transaction.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(
        transaction.stripeCheckoutSessionId
      );
      if (existing.status === 'open' && existing.url) session = existing;
    } catch {
      // Session vanished or belongs to another key — fall through and make one.
    }
  }

  if (!session) {
    const caregiverName = await displayName(caregiverId);
    const returnTo = `${appUrl()}/partner/pros/${caregiverId}`;
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: transaction.currency || 'usd',
              unit_amount: transaction.priceChargedCents,
              product_data: {
                name: `${caregiverName} — credential packet`,
                description:
                  'One-time purchase. Includes e-signature tracking and free re-downloads.',
              },
            },
          },
        ],
        // Both carry the id: the session for checkout.session.completed, the
        // intent for the payment_intent.* events, so whichever arrives first
        // can settle the transaction.
        metadata: {
          transactionId: String(transaction._id),
          agencyId: String(agencyId),
          caregiverId: String(caregiverId),
          product: 'credential_packet',
        },
        payment_intent_data: {
          metadata: {
            transactionId: String(transaction._id),
            agencyId: String(agencyId),
            caregiverId: String(caregiverId),
            product: 'credential_packet',
          },
        },
        success_url: `${returnTo}?payment=success&tx=${transaction._id}`,
        cancel_url: `${returnTo}?payment=cancelled&tx=${transaction._id}`,
      },
      // Stripe-side idempotency: the same transaction never yields two checkout
      // sessions even if this endpoint is called twice concurrently. The price
      // is part of the key because Stripe rejects a reused key whose parameters
      // have changed — after a re-price above, the same transaction legitimately
      // needs a second session for the new amount.
      { idempotencyKey: `packet_cs_${transaction._id}_${transaction.priceChargedCents}` }
    );
    transaction.stripeCheckoutSessionId = session.id;
    if (typeof session.payment_intent === 'string') {
      transaction.stripePaymentIntentId = session.payment_intent;
    }
    await transaction.save();
  }

  return {
    alreadyPaid: false,
    transactionId: String(transaction._id),
    priceCents: transaction.priceChargedCents,
    currency: transaction.currency,
    // The agency is sent to Stripe's own page rather than typing a card into a
    // modal on our site.
    checkoutUrl: session.url,
    testMode: false,
  };
};

/**
 * Mark a transaction paid. Called ONLY from the webhook (or the QA simulator),
 * never from a client claim.
 *
 * Idempotent against Stripe's at-least-once delivery: an event id already
 * recorded is ignored, and an already-paid row is left untouched.
 */
export const markPaid = async (params: {
  transactionId: string;
  eventId?: string;
  paymentIntentId?: string;
}) => {
  const { transactionId, eventId, paymentIntentId } = params;
  const transaction = await PacketTransaction.findById(transactionId);
  if (!transaction) return null;

  if (eventId && (transaction.stripeEventIds || []).includes(eventId)) {
    return transaction; // already processed this exact event
  }

  if (transaction.status !== 'paid') {
    transaction.status = 'paid';
    transaction.paidAt = new Date();
    transaction.failureMessage = undefined;
  }
  if (paymentIntentId) transaction.stripePaymentIntentId = paymentIntentId;
  if (eventId) transaction.stripeEventIds = [...(transaction.stripeEventIds || []), eventId];
  await transaction.save();
  return transaction;
};

/** Record a decline. No entitlement is granted and no file is released. */
export const markFailed = async (params: {
  transactionId: string;
  eventId?: string;
  message?: string;
}) => {
  const { transactionId, eventId, message } = params;
  const transaction = await PacketTransaction.findById(transactionId);
  if (!transaction) return null;

  if (eventId && (transaction.stripeEventIds || []).includes(eventId)) {
    return transaction;
  }
  // A paid row is never downgraded by a late failure event.
  if (transaction.status !== 'paid') {
    transaction.status = 'failed';
    transaction.failureMessage = message || 'Payment failed';
  }
  if (eventId) transaction.stripeEventIds = [...(transaction.stripeEventIds || []), eventId];
  await transaction.save();
  return transaction;
};

/**
 * Verify and handle a Stripe webhook. The raw body is required — a parsed body
 * cannot be signature-checked.
 */
export const handleWebhook = async (rawBody: Buffer, signature: string) => {
  const stripe = stripeClient();
  const secret = config.stripe.webhook_secret;
  if (!stripe || !secret) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Stripe is not configured');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    // An unverified payload is not evidence of anything.
    throw new ApiError(httpStatus.BAD_REQUEST, `Webhook signature failed: ${err.message}`);
  }

  // Both shapes carry our transactionId in metadata, and both are handled:
  // the hosted checkout page settles via checkout.session.*, while the
  // payment_intent.* events still arrive and are the fallback if a session
  // event is missed. markPaid/markFailed dedupe on event id, so a transaction
  // covered by both is only ever settled once.
  const object = event.data.object as any;
  const transactionId = object?.metadata?.transactionId;

  if (transactionId) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = object as Stripe.Checkout.Session;
        // A completed session is not automatically a paid one — an async method
        // can still be processing. Only 'paid' releases the packet.
        if (s.payment_status === 'paid') {
          await markPaid({
            transactionId,
            eventId: event.id,
            paymentIntentId:
              typeof s.payment_intent === 'string' ? s.payment_intent : undefined,
          });
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        const s = object as Stripe.Checkout.Session;
        await markPaid({
          transactionId,
          eventId: event.id,
          paymentIntentId:
            typeof s.payment_intent === 'string' ? s.payment_intent : undefined,
        });
        break;
      }
      case 'checkout.session.async_payment_failed':
        await markFailed({
          transactionId,
          eventId: event.id,
          message: 'The payment did not go through',
        });
        break;
      // The agency closed or abandoned the Stripe page. Not a failure — the
      // transaction simply stays incomplete, which is exactly what the ledger
      // should record.
      case 'checkout.session.expired':
        break;
      case 'payment_intent.succeeded':
        await markPaid({
          transactionId,
          eventId: event.id,
          paymentIntentId: (object as Stripe.PaymentIntent).id,
        });
        break;
      case 'payment_intent.payment_failed':
        await markFailed({
          transactionId,
          eventId: event.id,
          message:
            (object as Stripe.PaymentIntent).last_payment_error?.message ||
            'Card declined',
        });
        break;
      default:
        break;
    }
  }

  return { received: true, type: event.type };
};

/**
 * Ask Stripe directly what happened to a transaction's PaymentIntent.
 *
 * This is NOT the client telling us it paid — it is our server asking Stripe,
 * which is the same authority the webhook speaks with. It exists for two
 * reasons: the webhook secret may not be configured yet, and in production
 * webhooks are occasionally delayed or dropped, which would otherwise strand a
 * paying agency on the processing screen.
 *
 * Safe to call repeatedly: markPaid and markFailed are both idempotent.
 */
export const confirmFromStripe = async (params: {
  transactionId: string;
  agencyId: string;
}) => {
  const transaction = await PacketTransaction.findOne({
    _id: params.transactionId,
    agency: params.agencyId,
  });
  if (!transaction) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  if (transaction.status === 'paid') return transaction;

  const stripe = stripeClient();
  if (!stripe) return transaction;

  // With the hosted checkout page the session is created first and the intent
  // only attaches once the agency starts paying, so the intent id may not be on
  // the transaction yet. Ask the session for it before giving up — otherwise an
  // agency who paid on Stripe's page but whose webhook was delayed would sit on
  // the processing screen with nothing able to move them off it.
  if (!transaction.stripePaymentIntentId && transaction.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        transaction.stripeCheckoutSessionId
      );
      if (session.payment_status === 'paid') {
        return markPaid({
          transactionId: String(transaction._id),
          eventId: `confirm_cs_${session.id}`,
          paymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : undefined,
        });
      }
      if (typeof session.payment_intent === 'string') {
        transaction.stripePaymentIntentId = session.payment_intent;
        await transaction.save();
      }
    } catch {
      // Session gone — fall through to the intent path below.
    }
  }

  if (!transaction.stripePaymentIntentId) return transaction;

  const intent = await stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);

  if (intent.status === 'succeeded') {
    return markPaid({
      transactionId: String(transaction._id),
      eventId: `confirm_${intent.id}`,
      paymentIntentId: intent.id,
    });
  }
  if (intent.status === 'canceled' || intent.last_payment_error) {
    return markFailed({
      transactionId: String(transaction._id),
      eventId: `confirm_${intent.id}_${intent.status}`,
      message: intent.last_payment_error?.message || 'Card declined',
    });
  }
  // Still in flight — leave it pending and let the caller poll again.
  return transaction;
};

/**
 * QA-only state driver. Refuses outright once Stripe is configured, so it
 * cannot be used to bypass a real payment.
 */
export const simulate = async (params: {
  transactionId: string;
  outcome: 'succeed' | 'fail';
  agencyId: string;
}) => {
  if (!isTestMode()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Simulation is disabled — payments run through Stripe'
    );
  }
  const transaction = await PacketTransaction.findOne({
    _id: params.transactionId,
    agency: params.agencyId,
  });
  if (!transaction) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');

  if (params.outcome === 'succeed') {
    return markPaid({ transactionId: params.transactionId, eventId: `sim_${Date.now()}` });
  }
  return markFailed({
    transactionId: params.transactionId,
    eventId: `sim_${Date.now()}`,
    message: 'Card declined — insufficient funds (no charge made)',
  });
};

/** Record that the packet actually reached the agency. */
export const markDelivered = async (transactionId: string) => {
  await PacketTransaction.findByIdAndUpdate(transactionId, {
    $set: { deliveredAt: new Date() },
  });
};

/** The agency's own purchase history, for receipts. */
export const getMyTransactions = async (agencyId: string) => {
  const rows = await PacketTransaction.find({ agency: agencyId })
    .sort({ transactionDate: -1 })
    .lean();
  return Promise.all(
    rows.map(async (t: any) => ({
      _id: t._id,
      caregiverName: await displayName(String(t.caregiver)),
      caregiverId: t.caregiver,
      priceChargedCents: t.priceChargedCents,
      currency: t.currency,
      status: t.status,
      transactionDate: t.transactionDate,
      paidAt: t.paidAt,
    }))
  );
};
