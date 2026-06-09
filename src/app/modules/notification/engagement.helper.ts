import { Offer } from '../offer/offer.model';
import { Shift } from '../shift/shift.model';

/**
 * SCRUM-65: Determines if an agency has an "active engagement" with a caregiver.
 * Active engagement means at least one of:
 * - A Pending offer from the agency to the caregiver
 * - An Upcoming or Active shift where the caregiver is assigned
 */
export const getEngagedAgencies = async (
  caregiverId: string
): Promise<string[]> => {
  const agencyIds = new Set<string>();

  // 1. Check Offers: agency has a pending offer to this caregiver
  const pendingOffers = await Offer.find({
    pro: caregiverId,
    status: 'pending',
  }).select('partner');

  pendingOffers.forEach((offer: any) => {
    if (offer.partner) agencyIds.add(offer.partner.toString());
  });

  // Also include 'onboarded' offers (active relationship)
  const onboardedOffers = await Offer.find({
    pro: caregiverId,
    status: 'onboarded',
  }).select('partner');

  onboardedOffers.forEach((offer: any) => {
    if (offer.partner) agencyIds.add(offer.partner.toString());
  });

  // 2. Check Shifts: caregiver is assigned to pending/upcoming/active shifts
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
