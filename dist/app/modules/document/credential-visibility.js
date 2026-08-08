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
exports.filterVisibleDocuments = exports.isAgencyConfirmed = exports.isSensitiveCredential = void 0;
const user_model_1 = require("../user/user.model");
/**
 * SCRUM-99 / SCRUM-100 — credential tier gate.
 *
 * Sensitive credentials stay hidden from an agency until that agency is
 * CONFIRMED (verified via the Georgia Home Care Provider Registry + Secretary
 * of State). Per the July-23 legal call (Lucas): health results + background
 * checks are sensitive; professional qualifications + license are general.
 *
 * The mapping lives here so it can change in one place. Confirm the final list
 * with Lucas — current default:
 *   sensitive  = TB test, GCHEXS (background check)
 *   general    = CNA/PCA certificate, driver's license, auto insurance, CPR
 */
const SENSITIVE_TYPES = new Set(['tb_tests', 'gchexs']);
const isSensitiveCredential = (documentType) => !!documentType && SENSITIVE_TYPES.has(documentType);
exports.isSensitiveCredential = isSensitiveCredential;
/**
 * An agency is "Confirmed" (may see sensitive credentials) when its account
 * status is 'approved'. 'pending' = Non-confirmed, 'in-review' = Pending
 * Verification — neither can see the sensitive tier.
 */
const isAgencyConfirmed = (status) => status === 'approved';
exports.isAgencyConfirmed = isAgencyConfirmed;
/**
 * Filter a caregiver's documents to what a requester may see.
 *
 * Rules:
 *  - The caregiver viewing their OWN documents sees everything.
 *  - An admin/super_admin sees everything.
 *  - An agency sees general-tier credentials always, and sensitive-tier only
 *    once the agency is Confirmed.
 *
 * NOTE: the per-document public/private privacy layer is deliberately not
 * enforced here yet (the default is 'private', so enforcing it would hide
 * general credentials the share flow is meant to show). The tier gate above is
 * the legally-required change; the privacy layer already has its own
 * request/grant flow (PrivateAccess) and is a follow-up.
 *
 * @param docs         the caregiver's documents (may include a virtual gchexs doc)
 * @param requesterId  whoever is asking (undefined => treat as un-confirmed)
 * @param caregiverId  the owner of the documents
 */
const filterVisibleDocuments = (docs, requesterId, caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // Owner sees everything.
    if (requesterId && requesterId.toString() === caregiverId.toString()) {
        return docs;
    }
    let confirmed = false;
    if (requesterId) {
        const requester = yield user_model_1.User.findById(requesterId, { status: 1, role: 1 });
        // Admins see everything.
        if (requester &&
            (requester.role === 'admin' || requester.role === 'super_admin')) {
            return docs;
        }
        confirmed = (0, exports.isAgencyConfirmed)(requester === null || requester === void 0 ? void 0 : requester.status);
    }
    // Tier gate: hide sensitive credentials until the agency is Confirmed.
    return docs.filter((doc) => !(0, exports.isSensitiveCredential)(doc.documentType) || confirmed);
});
exports.filterVisibleDocuments = filterVisibleDocuments;
