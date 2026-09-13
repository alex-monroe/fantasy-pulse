/**
 * Pure helpers behind the popup. Kept free of `chrome.*` and DOM access so
 * they can run under `node --test` (see espn-cookies.test.js).
 */

/** The cookie names ESPN's fantasy API authenticates with. */
export const ESPN_COOKIE_NAMES = ['espn_s2', 'SWID'];

/**
 * Counts the labels in a cookie domain, ignoring the leading dot that marks
 * a domain cookie. `.espn.com` and `espn.com` both score 2; a host-only
 * `fantasy.espn.com` scores 3.
 * @param {string} domain - A cookie's `domain` field.
 * @returns {number} The number of labels.
 */
function domainSpecificity(domain) {
  return domain.replace(/^\./, '').split('.').filter(Boolean).length;
}

/**
 * Picks the cookie to use when a name resolves to more than one.
 *
 * ESPN sets both values on `.espn.com`, but a stale host-only copy on
 * `fantasy.espn.com` can linger after a sign-out and shadow the live one.
 * Prefer the broadest domain, then the longest value — a truncated or
 * placeholder duplicate is always the shorter of the two.
 * @param {Array<{domain: string, value: string}>} cookies - Candidates from `chrome.cookies.getAll`.
 * @returns {{domain: string, value: string} | null} The best candidate, or null when there are none.
 */
export function pickCookie(cookies) {
  const usable = (cookies ?? []).filter((cookie) => cookie && cookie.value);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => {
    const bySpecificity = domainSpecificity(a.domain) - domainSpecificity(b.domain);
    if (bySpecificity !== 0) return bySpecificity;
    return b.value.length - a.value.length;
  })[0];
}

/**
 * Normalizes a SWID into the `{GUID}` form Roster Loom's connect form expects.
 *
 * Chrome hands the value back exactly as ESPN stored it, which is sometimes
 * percent-encoded (`%7BGUID%7D`). Pasting that in would survive the server's
 * own `normalizeSwid` as a double-wrapped `{%7BGUID%7D}`, so decode first.
 * @param {string} value - The raw SWID cookie value.
 * @returns {string} The SWID wrapped in a single pair of braces.
 */
export function normalizeSwid(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  let decoded = trimmed;
  if (/%7[BD]/i.test(trimmed)) {
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      // A malformed escape means the value isn't encoded after all — use it as is.
      decoded = trimmed;
    }
  }
  const bare = decoded.replace(/[{}]/g, '').trim();
  return bare ? `{${bare}}` : '';
}

/**
 * Normalizes an `espn_s2` value.
 *
 * Deliberately *not* percent-decoded: this value goes back to ESPN verbatim
 * in a `Cookie` header, and decoding its `%2B` / `%2F` escapes would produce
 * a token ESPN rejects.
 * @param {string} value - The raw `espn_s2` cookie value.
 * @returns {string} The trimmed value.
 */
export function normalizeEspnS2(value) {
  return (value ?? '').trim();
}

/**
 * Pulls the league ID out of an ESPN fantasy URL, so the popup can offer it
 * alongside the cookies instead of making the user dig through the address bar.
 * @param {string | undefined} url - The active tab's URL.
 * @returns {string | null} The league ID, or null if the URL has none.
 */
export function extractLeagueId(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)espn\.com$/i.test(parsed.hostname)) return null;

  const sources = [parsed.searchParams, new URLSearchParams(parsed.hash.replace(/^#\/?/, ''))];
  for (const params of sources) {
    for (const [key, value] of params) {
      if (key.toLowerCase() !== 'leagueid') continue;
      if (/^\d+$/.test(value)) return value;
    }
  }
  return null;
}

/**
 * Renders a value for display, showing enough of it to recognize without
 * putting a full session token on screen (or in a screen-share) by default.
 * @param {string} value - The value to mask.
 * @returns {string} An abbreviated form of the value.
 */
export function maskValue(value) {
  if (value.length <= 12) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}${'•'.repeat(8)}${value.slice(-4)} (${value.length} chars)`;
}
