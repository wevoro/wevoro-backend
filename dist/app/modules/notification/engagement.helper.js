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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAgencyEngaged = exports.getEngagedAgencies = void 0;
const offer_model_1 = require("../offer/offer.model");
const shift_model_1 = require("../shift/shift.model");
/**
 * SCRUM-65: Determines if an agency has an "active engagement" with a caregiver.
 * Active engagement means at least one of:
 * - A Pending offer from the agency to the caregiver
 * - An Upcoming or Active shift where the caregiver is assigned
 */
const getEngagedAgencies = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const agencyIds = new Set();
    // 1. Check Offers: agency has a pending offer to this caregiver
    const pendingOffers = yield offer_model_1.Offer.find({
        pro: caregiverId,
        status: 'pending',
    }).select('partner');
    pendingOffers.forEach((offer) => {
        if (offer.partner)
            agencyIds.add(offer.partner.toString());
    });
    // Also include 'onboarded' offers (active relationship)
    const onboardedOffers = yield offer_model_1.Offer.find({
        pro: caregiverId,
        status: 'onboarded',
    }).select('partner');
    onboardedOffers.forEach((offer) => {
        if (offer.partner)
            agencyIds.add(offer.partner.toString());
    });
    // 2. Check Shifts: caregiver is assigned to pending/upcoming/active shifts
    const activeShifts = yield shift_model_1.Shift.find({
        'assignedCaregivers.caregiver': caregiverId,
        status: { $in: ['pending', 'upcoming', 'active'] },
    }).select('partner');
    activeShifts.forEach((shift) => {
        if (shift.partner)
            agencyIds.add(shift.partner.toString());
    });
    return Array.from(agencyIds);
});
exports.getEngagedAgencies = getEngagedAgencies;
/**
 * Check if a specific agency is engaged with a specific caregiver
 */
const isAgencyEngaged = (agencyId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // Check offers
    const offerExists = yield offer_model_1.Offer.findOne({
        partner: agencyId,
        pro: caregiverId,
        status: { $in: ['pending', 'onboarded'] },
    });
    if (offerExists)
        return true;
    // Check shifts
    const shiftExists = yield shift_model_1.Shift.findOne({
        partner: agencyId,
        'assignedCaregivers.caregiver': caregiverId,
        status: { $in: ['pending', 'upcoming', 'active'] },
    });
    if (shiftExists)
        return true;
    return false;
});
exports.isAgencyEngaged = isAgencyEngaged;
