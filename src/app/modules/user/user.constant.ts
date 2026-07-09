/* eslint-disable no-unused-vars */

/**
 * Super Admin panel — granular per-admin permission keys.
 *
 * Authorization model:
 *  - super_admin  => implicit all-access (never gated by individual keys).
 *  - admin        => gated by the keys in their `permissions` array.
 *  - admin whose `permissions` is empty/missing => treated as a full legacy
 *    admin (all keys granted). Granular restriction is opt-in per admin, so
 *    every pre-existing admin keeps working untouched.
 *
 * `manage_admins` is a super-admin-only surface and is NOT grantable to a plain
 * admin (the super-admin management endpoints are guarded by role, not by key).
 */
export enum ENUM_PERMISSION {
  MANAGE_ADMINS = 'manage_admins',
  MANAGE_CAREGIVERS = 'manage_caregivers',
  MANAGE_AGENCIES = 'manage_agencies',
  REVIEW_CREDENTIALS = 'review_credentials',
  VIEW_ANALYTICS = 'view_analytics',
  MANAGE_FEEDBACK = 'manage_feedback',
}

/** Keys a super admin may grant to a plain admin (manage_admins excluded). */
export const GRANTABLE_PERMISSIONS: string[] = [
  ENUM_PERMISSION.MANAGE_CAREGIVERS,
  ENUM_PERMISSION.MANAGE_AGENCIES,
  ENUM_PERMISSION.REVIEW_CREDENTIALS,
  ENUM_PERMISSION.VIEW_ANALYTICS,
  ENUM_PERMISSION.MANAGE_FEEDBACK,
];

/** Human-readable labels for the admin panel UI. */
export const PERMISSION_LABELS: Record<string, string> = {
  [ENUM_PERMISSION.MANAGE_CAREGIVERS]: 'Manage Caregivers',
  [ENUM_PERMISSION.MANAGE_AGENCIES]: 'Manage Agencies',
  [ENUM_PERMISSION.REVIEW_CREDENTIALS]: 'Review Credentials',
  [ENUM_PERMISSION.VIEW_ANALYTICS]: 'View Analytics',
  [ENUM_PERMISSION.MANAGE_FEEDBACK]: 'Manage Feedback',
};
