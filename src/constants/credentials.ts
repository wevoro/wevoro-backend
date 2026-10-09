/**
 * SCRUM-60: the credentials every caregiver is required to upload.
 *
 * Single source of truth for the required list. Mirrors the frontend's
 * `lib/credential-config.ts` — keep the two in sync.
 *
 * SCRUM-93: this list previously existed only inline inside
 * `document.service.ts#getCredentialStatus`, while `calculateProCompletion`
 * carried its own hardcoded pair (driver_license + tb_tests). The two drifted
 * apart when the required list grew from 2 to 5, which is what let a caregiver
 * reach 100% completion with credentials still missing. Both now read this.
 */
export const REQUIRED_CREDENTIAL_KEYS = [
  // SCRUM-155 / 163 / 164: in display order ([Role] Certificate, CPR, TB,
  // Driver's License, Auto Insurance — SCRUM-62/63 as amended 2026-09-16), the
  // same as the frontend list, so the share-link tooltip and the package
  // manifest list credentials the way every screen does.
  'certifications',
  'cpr_test',
  'tb_tests',
  'driver_license',
  'auto_insurance',
] as const;

/** Rank of a credential type in the display order; unknown types go last. */
export const credentialDisplayRank = (documentType?: string | null): number => {
  const i = (REQUIRED_CREDENTIAL_KEYS as readonly string[]).indexOf(String(documentType));
  return i === -1 ? REQUIRED_CREDENTIAL_KEYS.length : i;
};

export type RequiredCredentialKey = (typeof REQUIRED_CREDENTIAL_KEYS)[number];

/**
 * SCRUM-165: the PCA certificate is uploaded in two parts, both stored as
 * 'certifications' rows: the written exam (or a legacy certificate, which has
 * no `part`) and the RN/LPN practical sign-off. Mirrors the frontend's
 * `CertificatePart` in lib/credential-config.ts.
 */
export const CERTIFICATE_PARTS = ['written_exam', 'practical_signoff'] as const;
export type CertificatePart = (typeof CERTIFICATE_PARTS)[number];

/** SCRUM-165: the sign-off's name, as onboarding step 3 prints it. */
export const PCA_SIGNOFF_LABEL = 'RN/LPN practical sign-off';

/**
 * SCRUM-165: is this row THE credential for its type, rather than the RN/LPN
 * practical sign-off that rides alongside the PCA certificate?
 *
 * Every by-type lookup keys on documentType alone, so a second 'certifications'
 * row would stand in for the certificate whenever it happened to sort last: a
 * pending sign-off kept a verified PCA's share link shut, and an approved one
 * opened it with the written exam still unreviewed. The share gate, profile
 * completion and the credential status list therefore read primary rows only,
 * and the written exam (or legacy certificate) alone decides "PCA
 * Certificate". Legacy rows carry no `part`, so they stay primary.
 */
export const isPrimaryCredentialRow = (doc?: { part?: string | null } | null): boolean =>
  doc?.part !== 'practical_signoff';
