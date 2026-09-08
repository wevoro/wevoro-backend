import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { PersonalInfo } from '../user/personal-info.model';
import { PricingConfig, PriceHistory, PacketTransaction } from './pricing.model';

/**
 * SCRUM-113: pricing configuration and the transaction ledger.
 *
 * The price is founder-editable without a deploy. Every change is appended to
 * PriceHistory, which is never edited — the log is the audit trail.
 */

/** The launch price the ticket specifies, in cents. */
const DEFAULT_PRICE_CENTS = 4999;

const displayName = async (userId?: string): Promise<string> => {
  if (!userId) return 'System';
  const info = await PersonalInfo.findOne({ user: userId }).select(
    'firstName lastName companyName'
  );
  const person = `${info?.firstName || ''} ${info?.lastName || ''}`.trim();
  return (info as any)?.companyName || person || 'Admin';
};

/**
 * Read the single config row, creating it at the default price on first use.
 *
 * Written as an upsert rather than findOne-then-create because on Vercel this
 * can run concurrently on separate cold starts; two blind creates would race
 * and the unique `singleton` index would reject the loser.
 */
export const getConfig = async () => {
  const existing = await PricingConfig.findOne({ singleton: 'global' });
  if (existing) return existing;

  await PricingConfig.updateOne(
    { singleton: 'global' },
    {
      $setOnInsert: {
        currentPriceCents: DEFAULT_PRICE_CENTS,
        currency: 'usd',
        lastChangedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return PricingConfig.findOne({ singleton: 'global' });
};

/** Current price in cents. The single source of truth for what to charge. */
export const getCurrentPriceCents = async (): Promise<number> => {
  const config = await getConfig();
  return config?.currentPriceCents ?? DEFAULT_PRICE_CENTS;
};

/**
 * Change the price and append to the history.
 *
 * Applies to future packets only — existing transactions keep the
 * priceChargedCents they were created with, which is why that field is a value
 * and not a reference.
 */
export const updatePrice = async (params: {
  newPriceCents: number;
  reason?: string;
  changedBy: string;
}) => {
  const { newPriceCents, reason, changedBy } = params;

  if (!Number.isFinite(newPriceCents) || !Number.isInteger(newPriceCents)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Price must be a whole number of cents');
  }
  if (newPriceCents < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Price cannot be negative');
  }
  // A price above $10,000 is far more likely a decimal-point slip than an
  // intended change, and this field is founder-editable with no second pair of
  // eyes on it.
  if (newPriceCents > 1_000_000) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Price looks too high — enter the amount in dollars');
  }

  // The reason is free text typed by a founder and shown in a table forever.
  // Capping it here rather than only in the form keeps a very long paste from
  // becoming a permanent, unreadable row — the history is append-only, so a bad
  // row cannot be edited out afterwards.
  const cleanReason = (reason || '').trim().slice(0, 300);

  const config = await getConfig();
  const oldPriceCents = config?.currentPriceCents ?? null;

  if (oldPriceCents === newPriceCents) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That is already the current price');
  }

  const changedByName = await displayName(changedBy);

  config.currentPriceCents = newPriceCents;
  config.lastChangedBy = changedBy;
  config.lastChangedAt = new Date();
  await config.save();

  await PriceHistory.create({
    oldPriceCents,
    newPriceCents,
    currency: config.currency || 'usd',
    changedBy,
    changedByName,
    reason: cleanReason || undefined,
  });

  return config;
};

/** Append-only price change log, newest first. */
export const getPriceHistory = async (limit = 50) =>
  PriceHistory.find().sort({ createdAt: -1 }).limit(Math.min(limit, 200)).lean();

/**
 * Transactions for the admin table, with search, status filter and pagination.
 * Agency and caregiver names are resolved for display, since the table shows
 * names rather than ids.
 */
export const getTransactions = async (params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));

  const query: Record<string, any> = {};
  if (params.status && ['pending', 'paid', 'failed'].includes(params.status)) {
    query.status = params.status;
  }

  const rows = await PacketTransaction.find(query)
    .sort({ transactionDate: -1 })
    .lean();

  const withNames = await Promise.all(
    rows.map(async (t: any) => ({
      _id: t._id,
      agencyName: await displayName(String(t.agency)),
      caregiverName: await displayName(String(t.caregiver)),
      priceChargedCents: t.priceChargedCents,
      currency: t.currency,
      status: t.status,
      transactionDate: t.transactionDate,
    }))
  );

  // Search is applied after name resolution because the searchable fields are
  // the resolved names, which do not exist on the transaction row.
  const term = (params.search || '').trim().toLowerCase();
  const filtered = term
    ? withNames.filter(
        (t) =>
          t.agencyName.toLowerCase().includes(term) ||
          t.caregiverName.toLowerCase().includes(term)
      )
    : withNames;

  const total = filtered.length;
  const start = (page - 1) * limit;

  return {
    transactions: filtered.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

/** Everything the admin Pricing & Transactions screen needs, in one call. */
export const getOverview = async (params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const config = await getConfig();
  const [history, transactions] = await Promise.all([
    getPriceHistory(),
    getTransactions(params),
  ]);

  return {
    config: {
      currentPriceCents: config.currentPriceCents,
      currency: config.currency,
      lastChangedAt: config.lastChangedAt,
      lastChangedByName: await displayName(
        config.lastChangedBy ? String(config.lastChangedBy) : undefined
      ),
    },
    history,
    ...transactions,
  };
};
