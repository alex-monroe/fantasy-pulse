/**
 * Resolves the absolute origin of the running deployment from request
 * headers, so OAuth metadata and redirect URLs are correct in local dev,
 * preview and production alike.
 */
import { headers } from 'next/headers';

export async function resolveOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host');

  if (!host) {
    return '';
  }

  const forwardedProto = headerList.get('x-forwarded-proto');
  const protocol =
    forwardedProto?.split(',')[0]?.trim() ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');

  return `${protocol}://${host}`;
}
