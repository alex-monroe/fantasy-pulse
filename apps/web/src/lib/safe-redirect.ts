/**
 * Narrows a caller-supplied `next` destination down to a same-origin
 * path, or falls back when it isn't one.
 *
 * Both the login page and the auth callback take a `next` from the
 * query string, so both are one bad check away from being an open
 * redirect. Everything except a plain absolute path is rejected:
 * `//evil.com` and `/\evil.com` are protocol-relative URLs that
 * browsers happily follow off-origin, and anything without a leading
 * slash could be a full `https://…` URL.
 *
 * @param next - The requested destination, straight from the URL.
 * @param fallback - Where to go when `next` isn't a safe path.
 * @returns A relative path that is safe to redirect the browser to.
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback = '/',
): string {
  if (!next || !next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
