"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialExpiresAt = void 0;
/**
 * SCRUM-169 — when a credential expires.
 *
 * An expiration date is a calendar day on a certificate. The admin enters
 * "2026-09-23" and it is stored as 2026-09-23T00:00:00Z. Every countdown, the
 * share gate and the expiry emails then treated that instant as the moment of
 * expiry — which is 8 PM on Sep 22 in Georgia (7 PM in winter). The card read
 * "19h 38m" where the caregiver, at 12:20 AM on Sep 22, expected 23h 38m, and
 * a credential flipped to Expired the evening before its printed date.
 *
 * The expiry instant is now midnight at the start of the printed date in the
 * caregiver's zone. WeVoro's market is Georgia, so that zone is Eastern time;
 * one fixed zone keeps the caregiver, the agency and the admin — wherever they
 * sit — reading the same countdown. The frontend has an identical copy in
 * lib/credential-expiry.ts; keep the two in step.
 */
const ZONE = 'America/New_York';
const wallClock = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
});
/** Offset of ZONE from UTC at `ts`, in ms (negative west of Greenwich). */
const zoneOffsetMs = (ts) => {
    const parts = wallClock.formatToParts(new Date(ts));
    const get = (type) => { var _a, _b; return Number((_b = (_a = parts.find(p => p.type === type)) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0); };
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return wall - Math.floor(ts / 1000) * 1000;
};
/**
 * The instant a stored credential date expires: the END of the printed
 * calendar day, Eastern — that is, midnight at the start of the FOLLOWING day.
 * NaN when there is no readable date.
 *
 * SCRUM-208. This used to be midnight at the START of the printed day, which
 * made the printed date the first day the credential was NOT valid. A
 * certificate does not read that way: "Expiration date 21 October" means it is
 * good through the 21st. So every count came out one short — a TB Test printed
 * as expiring 21 October read "Expires in 18 days" on 2 October, where anyone
 * reading the card counts 19 — and the credential turned Expired a full day
 * before the date on its own face.
 *
 * Counting to the end of the printed day fixes both: the number matches the
 * date on the card, and the credential is valid for the whole of its last day.
 * SCRUM-169's point still holds — the boundary is a wall-clock midnight in one
 * fixed zone, not 8 PM the evening before, so nobody's countdown depends on
 * where they are sitting.
 *
 * The frontend has an identical copy in lib/credential-expiry.ts; keep the two
 * in step, or the email and the card disagree again (SCRUM-150).
 */
const credentialExpiresAt = (value) => {
    if (!value)
        return NaN;
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return NaN;
    // The stored value is UTC midnight of the printed day, so its UTC parts are
    // the printed day. +1 day lands on the midnight that ENDS it.
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate() + 1;
    let at = Date.UTC(y, m, day);
    // Two passes settle the offset across a DST change.
    for (let i = 0; i < 2; i++)
        at = Date.UTC(y, m, day) - zoneOffsetMs(at);
    return at;
};
exports.credentialExpiresAt = credentialExpiresAt;
