"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicSiteUrl = exports.currentSite = exports.siteContext = void 0;
const async_hooks_1 = require("async_hooks");
/**
 * Which WeVoro site the links in an email should point at.
 *
 * One backend project serves both: api.wevoro.com in front of wevoro.com, and
 * test-api.wevoro.com in front of qa.wevoro.com — sharing one set of
 * environment variables. A single APP_PUBLIC_URL can therefore only ever be
 * right for one of them, and it named the live site, so every CTA in every
 * email sent from the test site opened a page that only exists on QA:
 * "Download credential package" and "Download package" both landed on a 404
 * (reported 20 Sep).
 *
 * The request already says which side it came from — the API host it was sent
 * to, and the browser's own Origin. Remember that for the life of the request
 * so the email builders can read it. Payments do the same thing explicitly
 * with returnOrigin; this is the rest of the app catching up.
 */
const store = new async_hooks_1.AsyncLocalStorage();
/** The site in front of each API host. Nothing else is inferred. */
const SITE_BY_API_HOST = {
    'api.wevoro.com': 'https://wevoro.com',
    'www.wevoro.com': 'https://wevoro.com',
    'test-api.wevoro.com': 'https://qa.wevoro.com',
};
/** Sites an Origin/Referer may name. Anything else is ignored. */
const SITE_HOSTS = ['wevoro.com', 'www.wevoro.com', 'qa.wevoro.com', 'localhost'];
const fromUrl = (value) => {
    if (!value)
        return undefined;
    try {
        const url = new URL(value);
        const local = url.hostname === 'localhost';
        if (SITE_HOSTS.includes(url.hostname) && (url.protocol === 'https:' || local)) {
            return url.origin;
        }
    }
    catch (_a) {
        // Not a URL — nothing to learn from it.
    }
    return undefined;
};
const siteContext = (req, _res, next) => {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    // The host this request was sent to is decided by DNS, so it is checked
    // first: an Origin header is whatever the caller chose to write.
    const site = SITE_BY_API_HOST[host] ||
        fromUrl(req.headers.origin) ||
        fromUrl(req.headers.referer);
    store.run({ site }, () => next());
};
exports.siteContext = siteContext;
/** The site this request came from, when it named one we recognise. */
const currentSite = () => { var _a; return (_a = store.getStore()) === null || _a === void 0 ? void 0 : _a.site; };
exports.currentSite = currentSite;
/**
 * The base every email link and image is built on: the site this request came
 * from, else the configured one. Background work (the credential-expiry cron)
 * has no request, so it falls back to APP_PUBLIC_URL.
 */
const publicSiteUrl = () => ((0, exports.currentSite)() || process.env.APP_PUBLIC_URL || 'https://wevoro.com').replace(/\/+$/, '');
exports.publicSiteUrl = publicSiteUrl;
