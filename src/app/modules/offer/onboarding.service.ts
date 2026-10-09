import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError';
import { ENUM_USER_ROLE } from '../../../enums/user';
import { Offer } from './offer.model';
import { SignaturePacket, SigningDocument } from '../esign/esign.model';
import { Notification } from '../user/notification.model';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { User } from '../user/user.model';

/**
 * SCRUM-141 — Onboard → Respond → Submitted.
 *
 * The agency clicks Onboard on a caregiver's profile, which opens an offer. The
 * caregiver responds by signing what the agency sent (or just responding, when
 * the agency sent nothing). Only then may the agency pay for and download the
 * credential package. Before this, payment was deliberately independent of
 * signing, so an agency could buy a caregiver's credentials without the
 * caregiver ever agreeing to anything.
 *
 * The states, as the agency sees them:
 *   none       never onboarded
 *   awaiting   onboarded, caregiver has not responded
 *   signing    caregiver started signing and has not finished
 *   submitted  caregiver signed everything, or responded with nothing to sign
 *   declined   caregiver chose "Not interested"
 */
export type OnboardState = 'none' | 'awaiting' | 'signing' | 'submitted' | 'declined';

export interface OnboardStatus {
  state: OnboardState;
  offerId: string | null;
  onboardedAt: Date | null;
  submittedAt: Date | null;
  signedCount: number;
  totalToSign: number;
  /** What the caregiver was asked to sign, once a packet exists (A8 rows). */
  documents?: Array<{ title: string; signed: boolean }>;
}

const RESPONDED = ['responded', 'accepted', 'onboarded'];

/**
 * SCRUM-141: the only offers that count toward a pair's onboard state. An
 * offer opened by the Onboard button carries this source; scheduling-era job
 * offers carry none. The caregiver's signature through Respond is the first of
 * two mandatory gates, and a job offer the caregiver accepted under the old
 * flow was never that — yet it used to read as 'submitted', so the agency
 * could pay for and download the package without Onboard → Respond ever
 * happening. Such a pair now reads 'none': the agency sees Onboard, and the
 * old offer can no longer trip onboardCaregiver's "already onboarded" guard.
 * A packet the agency already paid for is unaffected — the entitlement, not
 * the onboard state, decides "Download again".
 */
export const ONBOARD_SOURCE = 'onboard';

/**
 * When an offer was submitted, if it has been.
 *
 * `submittedAt` is written from now on. Offers answered before it existed are
 * read from what they left behind: a completed packet, or a response with
 * nothing to sign. That fallback only serves the caregiver's own card (the
 * Submitted tab, via getOffers); it is never consent, because statusFor only
 * ever sees onboard offers.
 */
export const resolveSubmittedAt = (offer: any, packet?: any): Date | null => {
  if (offer?.submittedAt) return offer.submittedAt;
  // Onboard offers always record it, so a missing value means not submitted —
  // e.g. the packet failed to start and the caregiver still has to sign.
  if (offer?.source === ONBOARD_SOURCE) return null;
  if (!RESPONDED.includes(offer?.status)) return null;
  if (!packet) return offer.updatedAt || offer.createdAt || null;
  if (packet.status === 'completed') return packet.completedAt || packet.updatedAt || null;
  return null;
};

const statusFor = (offers: any[], packets: Map<string, any>): OnboardStatus => {
  const empty: OnboardStatus = {
    state: 'none',
    offerId: null,
    onboardedAt: null,
    submittedAt: null,
    signedCount: 0,
    totalToSign: 0,
  };
  if (!offers.length) return empty;

  const counts = (packet: any) => {
    const items = ((packet?.items as any[]) ?? []).filter((i) => i.status !== 'outdated');
    return {
      signedCount: items.filter((i) => i.status === 'signed').length,
      totalToSign: items.length,
      documents: items.map((i) => ({ title: i.title, signed: i.status === 'signed' })),
    };
  };

  // Any submitted onboard offer is consent for the pair. Only onboard offers
  // reach here (see ONBOARD_SOURCE): a scheduling-era job offer the caregiver
  // answered is not a signature through Respond.
  for (const offer of offers) {
    const packet = packets.get(String(offer._id));
    const submittedAt = resolveSubmittedAt(offer, packet);
    if (submittedAt) {
      return {
        state: 'submitted',
        offerId: String(offer._id),
        onboardedAt: offer.createdAt,
        submittedAt,
        ...counts(packet),
      };
    }
  }

  const latest = offers[0];
  const packet = packets.get(String(latest._id));
  const base = {
    offerId: String(latest._id),
    onboardedAt: latest.createdAt,
    submittedAt: null,
    ...counts(packet),
  };
  if (latest.status === 'rejected') return { state: 'declined', ...base };
  // SCRUM-170: each signature is saved as it is made so the caregiver can
  // resume later (SCRUM-118), and this used to pass that partial state on as
  // 'signing' with a live "N of M signed" count — the agency's Onboarding tab
  // and profile bar moved while the caregiver was still mid-flow. Nothing
  // reaches the agency until the caregiver has submitted the whole set: until
  // then the request simply reads "Awaiting signature", with nothing signed.
  if (packet && packet.status !== 'completed') {
    return {
      state: 'awaiting',
      ...base,
      signedCount: 0,
      documents: base.documents.map((d) => ({ ...d, signed: false })),
    };
  }
  return { state: 'awaiting', ...base };
};

/** Onboard status for many caregivers at once (the agency's Offers tab). */
export const getOnboardStatuses = async (
  agencyId: string,
  caregiverIds?: string[]
): Promise<Map<string, OnboardStatus>> => {
  // SCRUM-141: onboard offers only. Legacy job offers are left out here, at the
  // query, so every reader of the state — the profile, the Onboarding page,
  // checkout's consent check and onboardCaregiver's guard — follows one rule.
  const match: any = {
    partner: new mongoose.Types.ObjectId(agencyId),
    source: ONBOARD_SOURCE,
  };
  if (caregiverIds) {
    match.pro = {
      $in: caregiverIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  const offers = await Offer.find(match).sort({ createdAt: -1 }).lean();
  const packets = await SignaturePacket.find({
    offer: { $in: offers.map((o: any) => o._id) },
  }).lean();
  const packetByOffer = new Map<string, any>();
  packets.forEach((p: any) => packetByOffer.set(String(p.offer), p));

  const byCaregiver = new Map<string, any[]>();
  offers.forEach((o: any) => {
    const key = String(o.pro);
    if (!byCaregiver.has(key)) byCaregiver.set(key, []);
    byCaregiver.get(key)!.push(o);
  });

  const result = new Map<string, OnboardStatus>();
  byCaregiver.forEach((list, caregiverId) =>
    result.set(caregiverId, statusFor(list, packetByOffer))
  );
  (caregiverIds ?? []).forEach((id) => {
    if (!result.has(id)) result.set(id, statusFor([], packetByOffer));
  });
  return result;
};

export const getOnboardStatus = async (
  agencyId: string,
  caregiverId: string
): Promise<OnboardStatus> => {
  const map = await getOnboardStatuses(agencyId, [caregiverId]);
  return map.get(caregiverId) as OnboardStatus;
};

/**
 * The signature gate. Payment and download both wait on this. Onboard offers
 * only (SCRUM-141): an offer accepted under the old scheduling flow is not the
 * caregiver's consent to release the package.
 */
export const hasCaregiverSubmitted = async (
  agencyId: string,
  caregiverId: string
): Promise<boolean> => (await getOnboardStatus(agencyId, caregiverId)).state === 'submitted';

const agencyDisplayName = async (agencyId: string): Promise<string> => {
  const info: any = await PersonalInfo.findOne({ user: agencyId }).select(
    'companyName firstName lastName'
  );
  return (
    info?.companyName?.trim() ||
    `${info?.firstName || ''} ${info?.lastName || ''}`.trim() ||
    'An agency'
  );
};

/**
 * B5 (Faisal's agency flow): an agency cannot onboard before its own account
 * is complete — the same three fields the "Complete your agency account" form
 * collects, and the same test the login redirect uses.
 */
export const isAgencyAccountComplete = async (agencyId: string): Promise<boolean> => {
  const info: any = await PersonalInfo.findOne({ user: agencyId }).select(
    'companyName address'
  );
  return !!(info?.companyName && info?.address?.city && info?.address?.state);
};

/**
 * What the profile's action bar needs: the onboard state, whether the agency
 * already owns the package, the price, and how many signing documents the
 * agency has for this caregiver's role (the SCRUM-117 "Continue anyway" prompt
 * appears when that is zero).
 */
export const getOnboardSummary = async (agencyId: string, caregiverId: string) => {
  // Lazy: keeps the Stripe SDK out of routes that never touch payments.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { findEntitlement } = require('../payment/payment.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCurrentPriceCents } = require('../pricing/pricing.service');

  const prof: any = await ProfessionalInfo.findOne({ user: caregiverId }).select('role');
  const role = prof?.role || 'CNA';
  const [status, entitlement, priceCents, signingDocuments, accountComplete] =
    await Promise.all([
      getOnboardStatus(agencyId, caregiverId),
      findEntitlement(agencyId, caregiverId),
      getCurrentPriceCents(),
      SigningDocument.countDocuments({ agency: agencyId, role, status: 'active' }),
      isAgencyAccountComplete(agencyId),
    ]);
  return {
    ...status,
    caregiverRole: role,
    signingDocuments,
    paid: !!entitlement,
    paidAt: entitlement?.paidAt ?? null,
    priceCents: entitlement ? entitlement.priceChargedCents : priceCents,
    agencyAccountComplete: accountComplete,
  };
};

/**
 * The Onboard button. Opens the offer that carries the agency's signing
 * documents to the caregiver and tells the caregiver about it.
 *
 * Idempotent: a pair that is already onboarded gets its current state back and
 * no second notification. A caregiver who declined is not asked again. A pair
 * whose only offers are scheduling-era job offers reads 'none' and is onboarded
 * like any other (SCRUM-141), instead of being stuck behind the old offer.
 */
export const onboardCaregiver = async (agencyId: string, caregiverId: string) => {
  if (!mongoose.Types.ObjectId.isValid(caregiverId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Caregiver not found');
  }
  const caregiver = await User.findById(caregiverId).select('_id role');
  if (!caregiver || caregiver.role !== ENUM_USER_ROLE.PRO) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Caregiver not found');
  }

  /*
   * A pair that is already mid-flow gets its current state back and no second
   * request — asking twice while a caregiver is still deciding would send them
   * a duplicate.
   *
   * 'declined' is deliberately NOT in that set. It used to be, and a decline
   * was then final for ever: the caregiver's own copy is removed on decline
   * (SCRUM-55) and this guard stopped the agency ever asking again, so a tap on
   * "Not interested" cut the pair off permanently with no way back for either
   * side, or for an admin. Riad, 30 Sep: an agency may ask again as often as it
   * likes. A declined pair therefore falls through and a fresh request is
   * created, exactly as for a pair that has never been asked.
   */
  const current = await getOnboardStatus(agencyId, caregiverId);
  if (current.state !== 'none' && current.state !== 'declined') {
    return getOnboardSummary(agencyId, caregiverId);
  }

  if (!(await isAgencyAccountComplete(agencyId))) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Complete your agency account before you onboard a caregiver.'
    );
  }

  await Offer.create({
    partner: agencyId,
    pro: caregiverId,
    status: 'pending',
    source: ONBOARD_SOURCE,
  });

  // Best-effort: a notification failure must not undo the onboarding.
  try {
    const agencyName = await agencyDisplayName(agencyId);
    const prof: any = await ProfessionalInfo.findOne({ user: caregiverId }).select('role');
    const signCount = await SigningDocument.countDocuments({
      agency: agencyId,
      role: prof?.role || 'CNA',
      status: 'active',
    });
    await Notification.create({
      user: caregiverId,
      message:
        signCount > 0
          ? `<strong>${agencyName}</strong> wants to onboard you. Review and sign ${signCount} ${
              signCount === 1 ? 'document' : 'documents'
            } to respond.`
          : `<strong>${agencyName}</strong> wants to onboard you. Respond to share your confirmed credentials with them.`,
      type: 'onboard_request',
      ctaLink: '/caregiver/offers?tab=received',
      isRead: false,
    });
    const { sendOnboardRequestEmail } = await import('../esign/esign-email.service');
    await sendOnboardRequestEmail({ caregiverId, agencyName, signCount });
  } catch (err) {
    console.error('[onboard] could not notify the caregiver:', err);
  }

  return getOnboardSummary(agencyId, caregiverId);
};

/**
 * Record that the caregiver finished responding, and tell the agency. Called
 * when a response needs no signing, and when the last document is signed.
 * Runs once per offer: the conditional update is the guard, so a retried
 * request never notifies twice.
 *
 * Onboard offers only (SCRUM-141). A caregiver can still answer a leftover
 * scheduling-era job offer, but that is not consent to release the package, so
 * the agency must not be told "their credential package is ready to download"
 * while its own screens still offer Onboard.
 *
 * SCRUM-191: never a declined offer. Declining does not close the signature
 * packet — it stays 'pending', so the reminder cron keeps asking for the
 * signatures and signItem would still take them. The last one landed here, and
 * submittedAt is the gate checkout and download wait on, so a decline could be
 * undone into 'submitted' and the package sold after all. The status test is
 * part of the same conditional update, so it is checked where it is written.
 */
export const markOfferSubmitted = async (params: {
  offerId: string;
  at?: Date;
  signedCount?: number;
}): Promise<boolean> => {
  const at = params.at ?? new Date();
  const updated = await Offer.findOneAndUpdate(
    {
      _id: params.offerId,
      source: ONBOARD_SOURCE,
      submittedAt: null,
      status: { $ne: 'rejected' },
    },
    { $set: { submittedAt: at } },
    { new: true }
  );
  if (!updated) return false;

  try {
    const [info, prof]: any[] = await Promise.all([
      PersonalInfo.findOne({ user: updated.pro }).select('firstName lastName'),
      ProfessionalInfo.findOne({ user: updated.pro }).select('role'),
    ]);
    const caregiverName =
      `${info?.firstName || ''} ${info?.lastName || ''}`.trim() || 'The caregiver';
    const role: string = prof?.role || 'CNA';
    const signed = params.signedCount ?? 0;
    // A4 (Faisal's agency flow): "{Name} signed all 3 CNA documents."
    await Notification.create({
      user: updated.partner,
      message:
        // SCRUM-188: "signed all 1 CNA document" does not read as English.
        // One document is "their CNA document"; more than one keeps the count.
        signed === 1
          ? `<strong>${caregiverName}</strong> signed their ${role} document.`
          : signed > 1
          ? `<strong>${caregiverName}</strong> signed all ${signed} ${role} documents.`
          : `<strong>${caregiverName}</strong> responded to your onboarding. Their credential package is ready to download.`,
      type: 'onboard_submitted',
      ctaLink: `/agency/caregivers/${updated.pro}`,
      isRead: false,
    });
    const { sendOnboardSubmittedEmail } = await import('../esign/esign-email.service');
    await sendOnboardSubmittedEmail({
      agencyId: String(updated.partner),
      caregiverId: String(updated.pro),
      caregiverName,
      caregiverRole: role,
      signedCount: signed,
      signedAt: at,
    });
  } catch (err) {
    console.error('[onboard] could not notify the agency:', err);
  }
  return true;
};
