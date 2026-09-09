import { Schema, model } from 'mongoose';

/**
 * SCRUM-113: per-packet pricing.
 *
 * One global price applies platform-wide — not tiered, not per-agency, not a
 * subscription. Three collections:
 *
 *  - PricingConfig    the single active price
 *  - PriceHistory     append-only log of every change (never edited or deleted)
 *  - PacketTransaction one row per agency→caregiver packet purchase, carrying
 *                     the price it was actually charged rather than a live
 *                     reference to the current price, so a later price change
 *                     never rewrites history.
 */

const pricingConfigSchema = new Schema<any>(
  {
    // Stored in cents. Money in floating point is a bug waiting to happen, and
    // Stripe charges in the smallest currency unit anyway.
    currentPriceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd' },
    // Denormalised for the admin card, which shows who last changed the price
    // and when without joining the history.
    lastChangedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastChangedAt: { type: Date },
    // There is exactly one config row. This guards against a second being
    // created by a concurrent cold start.
    singleton: { type: String, default: 'global', unique: true, immutable: true },
  },
  { timestamps: true }
);

const priceHistorySchema = new Schema<any>(
  {
    // null on the very first row — there was no old price to change from.
    oldPriceCents: { type: Number, default: null },
    newPriceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd' },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedByName: { type: String },
    reason: { type: String },
  },
  { timestamps: true }
);

const packetTransactionSchema = new Schema<any>(
  {
    agency: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    caregiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Locked at the moment the transaction is created and never recalculated.
    priceChargedCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
      index: true,
    },
    transactionDate: { type: Date, default: Date.now },

    // --- SCRUM-115: Stripe linkage. Empty until a payment is attempted. ---
    stripePaymentIntentId: { type: String, index: true },
    // Payment moved from an embedded card form to a Stripe-hosted checkout
    // page: a stripe.com address reads as more trustworthy than a card form
    // inside a modal, which is where agencies were hesitating.
    stripeCheckoutSessionId: { type: String, index: true },
    // Stripe delivers webhooks at least once, so the handler must be able to
    // recognise an event it has already processed.
    stripeEventIds: { type: [String], default: [] },
    failureMessage: { type: String },
    paidAt: { type: Date },
    // Set once the packet has actually been handed over, so a delivery failure
    // after a successful charge is distinguishable from a fresh purchase.
    deliveredAt: { type: Date },
    receiptEmailSentAt: { type: Date },
  },
  { timestamps: true }
);

// One entitlement per agency/caregiver pair. A partial index would be ideal to
// scope this to paid rows only, but Mongo cannot express "unique among paid"
// portably here — uniqueness is enforced in the service instead, and this index
// keeps the lookup fast.
packetTransactionSchema.index({ agency: 1, caregiver: 1, status: 1 });

export const PricingConfig = model<any>('PricingConfig', pricingConfigSchema);
export const PriceHistory = model<any>('PriceHistory', priceHistorySchema);
export const PacketTransaction = model<any>('PacketTransaction', packetTransactionSchema);
