import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { PacketTransaction } from '../pricing/pricing.model';
import { ACCESS_WINDOW_DAYS } from './payment.service';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { User } from '../user/user.model';
import { sendEmail } from '../auth/sendMail';
import {
  EMAIL_COLORS as C,
  emailAppUrl,
  emailDetailRow,
  emailTintCard,
  escapeHtml,
  renderAlertEmail,
} from '../notification/email-layout';

/**
 * SCRUM-142 — WeVoro's own receipt for a credential package.
 *
 * Stripe stays the payment gateway, but the receipt is WeVoro's: agencies must
 * never wonder who charged them. Stripe's automatic receipts were never sent
 * (test mode does not send them, and the account runs Managed Payments), so the
 * success screen's "Stripe has emailed your receipt" was simply untrue.
 *
 * SCRUM-143 — the receipt is stored on the transaction (number, Stripe id,
 * recipient, the rendered email itself), so an admin can open it from the
 * Transactions table without going through Stripe's dashboard.
 */

const money = (cents: number, currency = 'usd') =>
  `$${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;

const formatDay = (d: Date) =>
  new Date(d).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const formatDate = (d: Date) =>
  new Date(d).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

/** WV-20260919-3F2A1C: the pay date plus the end of the transaction id. */
export const receiptNumberFor = (t: any): string => {
  const d = new Date(t.paidAt || t.transactionDate || Date.now());
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `WV-${ymd}-${String(t._id).slice(-6).toUpperCase()}`;
};

/**
 * The Stripe id to print. The hosted checkout attaches a PaymentIntent only
 * once the agency pays, so it may not be on the row yet — ask the session.
 */
const resolveStripeTransactionId = async (t: any): Promise<string | null> => {
  if (t.stripePaymentIntentId) return t.stripePaymentIntentId;
  if (t.stripeCheckoutSessionId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { stripeClient } = require('./payment.service');
      const stripe = stripeClient();
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(t.stripeCheckoutSessionId);
        if (typeof session.payment_intent === 'string') {
          t.stripePaymentIntentId = session.payment_intent;
          return session.payment_intent;
        }
      }
    } catch {
      // Fall back to the session id, which Stripe's dashboard also finds.
    }
    return t.stripeCheckoutSessionId;
  }
  return null;
};

/**
 * "Visa ending 4242", read from the charge. Best effort: a simulated QA
 * payment has no charge, and Stripe may not expose the card under Managed
 * Payments — then the row simply says "Card".
 */
const resolvePaymentMethod = async (stripeId: string | null): Promise<string | null> => {
  if (!stripeId || !stripeId.startsWith('pi_')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { stripeClient } = require('./payment.service');
    const stripe = stripeClient();
    if (!stripe) return null;
    const pi: any = await stripe.paymentIntents.retrieve(stripeId, {
      expand: ['latest_charge'],
    });
    const card = pi?.latest_charge?.payment_method_details?.card;
    if (card?.last4) {
      const brand = String(card.brand || 'card');
      const label = brand === 'amex' ? 'American Express' : brand.charAt(0).toUpperCase() + brand.slice(1);
      return `${label} ending ${card.last4}`;
    }
    const type = pi?.latest_charge?.payment_method_details?.type;
    return type ? String(type).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase()) : null;
  } catch {
    return null;
  }
};

/** What the package held when it was bought, for the "What's included" card. */
const packageContents = async (caregiverId: string, agencyId: string) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DownloadService } = require('../document/download.service');
    const [docs, signed] = await Promise.all([
      DownloadService.getDownloadableDocuments(caregiverId, agencyId),
      DownloadService.getSignedDocuments(caregiverId, agencyId),
    ]);
    const credentials = (docs as any[]).filter((d) => !d.isGchexs).length;
    const gchexs = (docs as any[]).some((d) => d.isGchexs);
    return { credentials, signed: (signed as any[]).length, gchexs };
  } catch {
    return null;
  }
};

const agencyName = async (agencyId: string) => {
  const info: any = await PersonalInfo.findOne({ user: agencyId }).select(
    'companyName firstName lastName'
  );
  return {
    company:
      info?.companyName?.trim() ||
      `${info?.firstName || ''} ${info?.lastName || ''}`.trim() ||
      'Your agency',
    first: info?.firstName?.trim() || 'there',
  };
};

const caregiverLabel = async (caregiverId: string) => {
  const [info, prof]: any[] = await Promise.all([
    PersonalInfo.findOne({ user: caregiverId }).select('firstName lastName'),
    ProfessionalInfo.findOne({ user: caregiverId }).select('role'),
  ]);
  const name = `${info?.firstName || ''} ${info?.lastName || ''}`.trim() || 'Caregiver';
  return { name, role: prof?.role || null };
};

/**
 * Render the receipt for a paid transaction, and fill its receipt fields.
 *
 * Layout and copy follow Faisal's A11 frame (payment receipt). The Stripe
 * transaction ID row is kept on top of the design because SCRUM-142 requires
 * it for traceability.
 */
const buildReceipt = async (t: any, email: string | null) => {
  const [agency, caregiver, stripeId, contents] = await Promise.all([
    agencyName(String(t.agency)),
    caregiverLabel(String(t.caregiver)),
    resolveStripeTransactionId(t),
    packageContents(String(t.caregiver), String(t.agency)),
  ]);
  const method = await resolvePaymentMethod(stripeId);
  const number = t.receiptNumber || receiptNumberFor(t);
  const paidAt = t.paidAt || t.updatedAt || new Date();
  const first = caregiver.name.split(/\s+/)[0] || caregiver.name;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const included = contents
    ? [
        // SCRUM-196: legal counsel set "confirmed" as the platform word; "verified"
        // carries a claim we do not make.
        contents.credentials > 0 ? plural(contents.credentials, 'confirmed credential') : '',
        contents.gchexs ? 'GCHEXS confirmation' : '',
        contents.signed > 0 ? plural(contents.signed, 'signed document') : '',
      ]
        .filter(Boolean)
        .join(' + ')
    : '';

  const html = renderAlertEmail({
    emblem: 'emblem-complete.png',
    eyebrow: 'PAYMENT RECEIPT',
    accent: C.green,
    heading: `Payment confirmed — ${first}'s package is ready`,
    // SCRUM-197: the greeting took the person's FIRST NAME from their profile,
    // so an account whose first name happens to be "Agency" was greeted
    // "Hi Agency" — which read as a broken placeholder on a receipt, at the
    // moment the agency had just paid. It is the business name now, and a
    // plain "Hi," when no business name is on file.
    greetingName: agency.company === 'Your agency' ? '' : escapeHtml(agency.company),
    // SCRUM-194: "re-downloads are always free" promised permanent access, which
    // is what the ticket removes. The 30-day window is stated instead, together
    // with the half the agency would otherwise not know: anything the caregiver
    // updates inside the window is theirs too.
    intro: `your payment went through and ${escapeHtml(caregiver.name)}'s credential package is now unlocked. You have ${ACCESS_WINDOW_DAYS} days of access from today, and that includes any credential ${escapeHtml(caregiver.name)} updates in that time.`,
    detailRowsHtml:
      emailDetailRow('AMOUNT PAID', money(t.priceChargedCents, t.currency), 0) +
      emailDetailRow('DATE', escapeHtml(formatDay(paidAt)), 14) +
      emailDetailRow(
        'PAYMENT METHOD',
        method ? escapeHtml(method) : stripeId ? 'Card' : 'Test payment &mdash; no card charged',
        14
      ) +
      emailDetailRow('RECEIPT NUMBER', escapeHtml(number), 14) +
      emailDetailRow(
        'STRIPE TRANSACTION ID',
        stripeId
          ? `<span style="font-family:Consolas,Menlo,monospace;font-size:13px">${escapeHtml(stripeId)}</span>`
          : 'Test payment &mdash; no Stripe charge',
        14
      ),
    extraHtml: included ? emailTintCard('WHAT&rsquo;S INCLUDED', escapeHtml(included)) : '',
    cta: 'Download package',
    ctaHref: `${emailAppUrl()}/agency/caregivers/${String(t.caregiver)}`,
    note: `Processed securely by Stripe on behalf of Wevoro. Keep this email as your receipt.${
      email ? ` Billed to ${escapeHtml(agency.company)} (${escapeHtml(email)}).` : ''
    }`,
    footerLine:
      'You&rsquo;re receiving this receipt because your agency bought a credential package on WeVoro.',
  });

  t.receiptNumber = number;
  t.stripeTransactionId = stripeId || undefined;
  t.receiptHtml = html;
  return { number, html, stripeId, caregiverName: caregiver.name };
};

/**
 * Email the receipt, once. Called by markPaid on every path that marks a
 * transaction paid (webhook, server-side confirm, the QA simulator).
 */
export const sendPacketReceipt = async (transactionId: string): Promise<void> => {
  const t = await PacketTransaction.findById(transactionId);
  if (!t || t.status !== 'paid' || t.receiptEmailSentAt) return;

  const agencyUser: any = await User.findById(t.agency).select('email');
  const email: string | null = agencyUser?.email || null;
  const { number, html, caregiverName } = await buildReceipt(t, email);

  if (!email) {
    t.receiptError = 'No email address on the agency account';
    await t.save();
    return;
  }
  try {
    await sendEmail(
      email,
      `Payment confirmed — ${caregiverName}'s package is ready (receipt ${number})`,
      html
    );
    t.receiptEmailSentAt = new Date();
    t.receiptSentTo = email;
    t.receiptError = undefined;
    console.log(`[payment] receipt ${number} emailed to ${email}`);
  } catch (err: any) {
    // Stored anyway, so the receipt is still viewable and the failure visible.
    t.receiptError = err?.message || 'Email failed';
    console.error(`[payment] receipt ${number} email FAILED:`, err?.message);
  }
  await t.save();
};

/**
 * The stored receipt, for the agency that paid or for an admin. A payment made
 * before receipts existed gets one built (and stored) on first view; it is not
 * emailed retroactively.
 */
export const getReceipt = async (params: {
  transactionId: string;
  userId: string;
  role: string;
}) => {
  const t = await PacketTransaction.findById(params.transactionId).catch(() => null);
  const isAdmin = ['admin', 'super_admin'].includes(params.role);
  if (!t || (!isAdmin && String(t.agency) !== String(params.userId))) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt not found');
  }
  if (t.status !== 'paid') {
    throw new ApiError(httpStatus.NOT_FOUND, 'This transaction has not been paid');
  }
  if (!t.receiptHtml) {
    const agencyUser: any = await User.findById(t.agency).select('email');
    await buildReceipt(t, agencyUser?.email || null);
    await t.save();
  }
  return {
    html: t.receiptHtml as string,
    receiptNumber: t.receiptNumber as string,
    stripeTransactionId: t.stripeTransactionId || null,
    receiptEmailSentAt: t.receiptEmailSentAt || null,
    receiptSentTo: t.receiptSentTo || null,
  };
};
