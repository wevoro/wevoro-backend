"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_CREDENTIAL_KEYS = void 0;
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
exports.REQUIRED_CREDENTIAL_KEYS = [
    'certifications',
    'driver_license',
    'auto_insurance',
    'cpr_test',
    'tb_tests',
];
