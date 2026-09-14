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
exports.getOverview = exports.getTransactions = exports.getPriceHistory = exports.updatePrice = exports.getCurrentPriceCents = exports.getConfig = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const personal_info_model_1 = require("../user/personal-info.model");
const pricing_model_1 = require("./pricing.model");
/**
 * SCRUM-113: pricing configuration and the transaction ledger.
 *
 * The price is founder-editable without a deploy. Every change is appended to
 * PriceHistory, which is never edited — the log is the audit trail.
 */
/** The launch price the ticket specifies, in cents. */
const DEFAULT_PRICE_CENTS = 4999;
const displayName = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!userId)
        return 'System';
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName lastName companyName');
    const person = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim();
    return (info === null || info === void 0 ? void 0 : info.companyName) || person || 'Admin';
});
/**
 * Read the single config row, creating it at the default price on first use.
 *
 * Written as an upsert rather than findOne-then-create because on Vercel this
 * can run concurrently on separate cold starts; two blind creates would race
 * and the unique `singleton` index would reject the loser.
 */
const getConfig = () => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield pricing_model_1.PricingConfig.findOne({ singleton: 'global' });
    if (existing)
        return existing;
    yield pricing_model_1.PricingConfig.updateOne({ singleton: 'global' }, {
        $setOnInsert: {
            currentPriceCents: DEFAULT_PRICE_CENTS,
            currency: 'usd',
            lastChangedAt: new Date(),
        },
    }, { upsert: true });
    return pricing_model_1.PricingConfig.findOne({ singleton: 'global' });
});
exports.getConfig = getConfig;
/** Current price in cents. The single source of truth for what to charge. */
const getCurrentPriceCents = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const config = yield (0, exports.getConfig)();
    return (_a = config === null || config === void 0 ? void 0 : config.currentPriceCents) !== null && _a !== void 0 ? _a : DEFAULT_PRICE_CENTS;
});
exports.getCurrentPriceCents = getCurrentPriceCents;
/**
 * Change the price and append to the history.
 *
 * Applies to future packets only — existing transactions keep the
 * priceChargedCents they were created with, which is why that field is a value
 * and not a reference.
 */
const updatePrice = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { newPriceCents, reason, changedBy } = params;
    if (!Number.isFinite(newPriceCents) || !Number.isInteger(newPriceCents)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Price must be a whole number of cents');
    }
    // Stripe will not charge less than $0.50, so a $0 price does not make packets
    // free — it breaks checkout for every agency until someone notices. The usual
    // source is an empty admin field: Number('') is 0, which slipped past both the
    // form's "is it a number" guard and the old `< 0` check here.
    if (newPriceCents < 50) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Price must be at least $0.50');
    }
    // A price above $10,000 is far more likely a decimal-point slip than an
    // intended change, and this field is founder-editable with no second pair of
    // eyes on it.
    if (newPriceCents > 1000000) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Price looks too high — enter the amount in dollars');
    }
    // The reason is free text typed by a founder and shown in a table forever.
    // Capping it here rather than only in the form keeps a very long paste from
    // becoming a permanent, unreadable row — the history is append-only, so a bad
    // row cannot be edited out afterwards.
    const cleanReason = (reason || '').trim().slice(0, 300);
    const config = yield (0, exports.getConfig)();
    const oldPriceCents = (_a = config === null || config === void 0 ? void 0 : config.currentPriceCents) !== null && _a !== void 0 ? _a : null;
    if (oldPriceCents === newPriceCents) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'That is already the current price');
    }
    const changedByName = yield displayName(changedBy);
    config.currentPriceCents = newPriceCents;
    config.lastChangedBy = changedBy;
    config.lastChangedAt = new Date();
    yield config.save();
    yield pricing_model_1.PriceHistory.create({
        oldPriceCents,
        newPriceCents,
        currency: config.currency || 'usd',
        changedBy,
        changedByName,
        reason: cleanReason || undefined,
    });
    return config;
});
exports.updatePrice = updatePrice;
/** Append-only price change log, newest first. */
const getPriceHistory = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (limit = 50) { return pricing_model_1.PriceHistory.find().sort({ createdAt: -1 }).limit(Math.min(limit, 200)).lean(); });
exports.getPriceHistory = getPriceHistory;
/**
 * Transactions for the admin table, with search, status filter and pagination.
 * Agency and caregiver names are resolved for display, since the table shows
 * names rather than ids.
 */
const getTransactions = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    const query = {};
    if (params.status && ['pending', 'paid', 'failed'].includes(params.status)) {
        query.status = params.status;
    }
    const rows = yield pricing_model_1.PacketTransaction.find(query)
        .sort({ transactionDate: -1 })
        .lean();
    const withNames = yield Promise.all(rows.map((t) => __awaiter(void 0, void 0, void 0, function* () {
        return ({
            _id: t._id,
            agencyName: yield displayName(String(t.agency)),
            caregiverName: yield displayName(String(t.caregiver)),
            priceChargedCents: t.priceChargedCents,
            currency: t.currency,
            status: t.status,
            transactionDate: t.transactionDate,
        });
    })));
    // Search is applied after name resolution because the searchable fields are
    // the resolved names, which do not exist on the transaction row.
    const term = (params.search || '').trim().toLowerCase();
    const filtered = term
        ? withNames.filter((t) => t.agencyName.toLowerCase().includes(term) ||
            t.caregiverName.toLowerCase().includes(term))
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
});
exports.getTransactions = getTransactions;
/** Everything the admin Pricing & Transactions screen needs, in one call. */
const getOverview = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const config = yield (0, exports.getConfig)();
    const [history, transactions] = yield Promise.all([
        (0, exports.getPriceHistory)(),
        (0, exports.getTransactions)(params),
    ]);
    return Object.assign({ config: {
            currentPriceCents: config.currentPriceCents,
            currency: config.currency,
            lastChangedAt: config.lastChangedAt,
            lastChangedByName: yield displayName(config.lastChangedBy ? String(config.lastChangedBy) : undefined),
        }, history }, transactions);
});
exports.getOverview = getOverview;
