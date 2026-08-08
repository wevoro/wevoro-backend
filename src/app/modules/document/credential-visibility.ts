import { User } from '../user/user.model';

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

export const isSensitiveCredential = (documentType?: string): boolean =>
  !!documentType && SENSITIVE_TYPES.has(documentType);

/**
 * An agency is "Confirmed" (may see sensitive credentials) when its account
 * status is 'approved'. 'pending' = Non-confirmed, 'in-review' = Pending
 * Verification — neither can see the sensitive tier.
 */
export const isAgencyConfirmed = (status?: string): boolean =>
  status === 'approved';

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
export const filterVisibleDocuments = async (
  docs: any[],
  requesterId: string | undefined,
  caregiverId: string
): Promise<any[]> => {
  // Owner sees everything.
  if (requesterId && requesterId.toString() === caregiverId.toString()) {
    return docs;
  }

  let confirmed = false;
  if (requesterId) {
    const requester = await User.findById(requesterId, { status: 1, role: 1 });
    // Admins see everything.
    if (
      requester &&
      (requester.role === 'admin' || requester.role === 'super_admin')
    ) {
      return docs;
    }
    confirmed = isAgencyConfirmed(requester?.status);
  }

  // Tier gate: hide sensitive credentials until the agency is Confirmed.
  return docs.filter(
    (doc) => !isSensitiveCredential(doc.documentType) || confirmed
  );
};
