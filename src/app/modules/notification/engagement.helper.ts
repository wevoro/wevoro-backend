import { Offer } from '../offer/offer.model';
// SCRUM-183: the same constant the onboard flow writes, so this never drifts
// from it. onboarding.service imports models only, so there is no cycle back.
import { ONBOARD_SOURCE } from '../offer/onboarding.service';
import { Shift } from '../shift/shift.model';
import { PacketTransaction } from '../pricing/pricing.model';

/**
 * SCRUM-65: Determines if an agency has an "active engagement" with a caregiver.
 * Active engagement means at least one of:
 * - A Pending offer from the agency to the caregiver
 * - An Upcoming or Active shift where the caregiver is assigned
 *
 * SCRUM-183: both clauses above are the OLD offers model, which SCRUM-141
 * retired, and that is why Scenario 6 of SCRUM-65 (tell the agency when a
 * credential goes Red) was never received. An onboard offer IS created
 * 'pending', so it matched — right up until the caregiver answered: Respond
 * writes status 'responded' (offer.service), which no clause matched, so the
 * agency fell out of this set at exactly the moment the caregiver agreed to
 * work with them, and stayed out for the whole life of the engagement.
 * "A Pending offer" no longer exists as a lasting state, so the two live
 * relationships are added below as its modern reading: an onboard offer the
 * caregiver has not declined, and a paid packet, which outlives the offer.
 */
export const getEngagedAgencies = async (
  caregiverId: string
): Promise<string[]> => {
  const agencyIds = new Set<string>();

  // 1. Check Offers:
  //    - legacy: a scheduling-era offer still pending, or an onboarded one
  //    - SCRUM-183: an onboard offer (SCRUM-141) in any state but declined —
  //      'pending' before the caregiver answers, 'responded'/'accepted' after
  const offers = await Offer.find({
    pro: caregiverId,
    $or: [
      { status: { $in: ['pending', 'onboarded'] } },
      { source: ONBOARD_SOURCE, status: { $ne: 'rejected' } },
    ],
  }).select('partner');

  offers.forEach((offer: any) => {
    if (offer.partner) agencyIds.add(offer.partner.toString());
  });

  // 2. SCRUM-183: an agency that has paid for this caregiver's packet. The
  //    strongest engagement there is, and the one that matters most here —
  //    they are holding credentials they paid for and need to know when one
  //    of them is about to lapse. The entitlement is permanent, so it keeps
  //    the agency informed after the offer itself has been answered.
  const paidPackets = await PacketTransaction.find({
    caregiver: caregiverId,
    status: 'paid',
  }).select('agency');

  paidPackets.forEach((t: any) => {
    if (t.agency) agencyIds.add(t.agency.toString());
  });

  // 3. Check Shifts: caregiver is assigned to pending/upcoming/active shifts
  const activeShifts = await Shift.find({
    'assignedCaregivers.caregiver': caregiverId,
    status: { $in: ['pending', 'upcoming', 'active'] },
  }).select('partner');

  activeShifts.forEach((shift: any) => {
    if (shift.partner) agencyIds.add(shift.partner.toString());
  });

  return Array.from(agencyIds);
};

/**
 * Check if a specific agency is engaged with a specific caregiver
 */
export const isAgencyEngaged = async (
  agencyId: string,
  caregiverId: string
): Promise<boolean> => {
  // Check offers
  const offerExists = await Offer.findOne({
    partner: agencyId,
    pro: caregiverId,
    status: { $in: ['pending', 'onboarded'] },
  });
  if (offerExists) return true;

  // Check shifts
  const shiftExists = await Shift.findOne({
    partner: agencyId,
    'assignedCaregivers.caregiver': caregiverId,
    status: { $in: ['pending', 'upcoming', 'active'] },
  });
  if (shiftExists) return true;

  return false;
};
