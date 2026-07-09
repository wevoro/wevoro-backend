"use strict";
/* eslint-disable no-unused-vars */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_LABELS = exports.GRANTABLE_PERMISSIONS = exports.ENUM_PERMISSION = void 0;
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
var ENUM_PERMISSION;
(function (ENUM_PERMISSION) {
    ENUM_PERMISSION["MANAGE_ADMINS"] = "manage_admins";
    ENUM_PERMISSION["MANAGE_CAREGIVERS"] = "manage_caregivers";
    ENUM_PERMISSION["MANAGE_AGENCIES"] = "manage_agencies";
    ENUM_PERMISSION["REVIEW_CREDENTIALS"] = "review_credentials";
    ENUM_PERMISSION["VIEW_ANALYTICS"] = "view_analytics";
    ENUM_PERMISSION["MANAGE_FEEDBACK"] = "manage_feedback";
})(ENUM_PERMISSION || (exports.ENUM_PERMISSION = ENUM_PERMISSION = {}));
/** Keys a super admin may grant to a plain admin (manage_admins excluded). */
exports.GRANTABLE_PERMISSIONS = [
    ENUM_PERMISSION.MANAGE_CAREGIVERS,
    ENUM_PERMISSION.MANAGE_AGENCIES,
    ENUM_PERMISSION.REVIEW_CREDENTIALS,
    ENUM_PERMISSION.VIEW_ANALYTICS,
    ENUM_PERMISSION.MANAGE_FEEDBACK,
];
/** Human-readable labels for the admin panel UI. */
exports.PERMISSION_LABELS = {
    [ENUM_PERMISSION.MANAGE_CAREGIVERS]: 'Manage Caregivers',
    [ENUM_PERMISSION.MANAGE_AGENCIES]: 'Manage Agencies',
    [ENUM_PERMISSION.REVIEW_CREDENTIALS]: 'Review Credentials',
    [ENUM_PERMISSION.VIEW_ANALYTICS]: 'View Analytics',
    [ENUM_PERMISSION.MANAGE_FEEDBACK]: 'Manage Feedback',
};
