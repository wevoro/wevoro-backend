import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';

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

const store = new AsyncLocalStorage<{ site?: string }>();

/** The site in front of each API host. Nothing else is inferred. */
const SITE_BY_API_HOST: Record<string, string> = {
  'api.wevoro.com': 'https://wevoro.com',
  'www.wevoro.com': 'https://wevoro.com',
  'test-api.wevoro.com': 'https://qa.wevoro.com',
};

/** Sites an Origin/Referer may name. Anything else is ignored. */
const SITE_HOSTS = ['wevoro.com', 'www.wevoro.com', 'qa.wevoro.com', 'localhost'];

const fromUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost';
    if (SITE_HOSTS.includes(url.hostname) && (url.protocol === 'https:' || local)) {
      return url.origin;
    }
  } catch {
    // Not a URL — nothing to learn from it.
  }
  return undefined;
};

export const siteContext = (req: Request, _res: Response, next: NextFunction) => {
  const host = String(
    req.headers['x-forwarded-host'] || req.headers.host || ''
  ).toLowerCase();
  // The host this request was sent to is decided by DNS, so it is checked
  // first: an Origin header is whatever the caller chose to write.
  const site =
    SITE_BY_API_HOST[host] ||
    fromUrl(req.headers.origin as string) ||
    fromUrl(req.headers.referer as string);
  store.run({ site }, () => next());
};

/** The site this request came from, when it named one we recognise. */
export const currentSite = (): string | undefined => store.getStore()?.site;

/**
 * The base every email link and image is built on: the site this request came
 * from, else the configured one. Background work (the credential-expiry cron)
 * has no request, so it falls back to APP_PUBLIC_URL.
 */
export const publicSiteUrl = (): string =>
  (currentSite() || process.env.APP_PUBLIC_URL || 'https://wevoro.com').replace(
    /\/+$/,
    ''
  );
