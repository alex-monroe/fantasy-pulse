const DEFAULT_CACHE_DURATION_SECONDS = 60 * 60;

type FetchJsonInit = RequestInit & {
  disableCache?: boolean;
};

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchJsonInit = {},
): Promise<{ data?: T; error?: string; status?: number }> {
  try {
    const { disableCache, ...rest } = init;
    const fetchInit = { ...rest } as RequestInit & { next?: { revalidate?: number } };

    const method = (fetchInit.method ?? 'GET').toString().toUpperCase();

    if (disableCache) {
      fetchInit.cache = 'no-store';
      const nextOptions = { ...(fetchInit.next ?? {}) };
      nextOptions.revalidate = 0;
      fetchInit.next = nextOptions;
    } else if (method === 'GET' && fetchInit.cache !== 'no-store') {
      const nextOptions = { ...(fetchInit.next ?? {}) };
      if (typeof nextOptions.revalidate === 'undefined') {
        nextOptions.revalidate = DEFAULT_CACHE_DURATION_SECONDS;
      }
      fetchInit.next = nextOptions;
    }

    const res = await fetch(input, fetchInit);
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      // Some APIs (notably Yahoo Fantasy) nest the error as an object, e.g.
      // { error: { description: '...' } }; unwrap it so callers never end up
      // interpolating "[object Object]" into user-facing messages.
      const nested = json?.error && typeof json.error === 'object' ? json.error : null;
      const message =
        json?.error_description ||
        json?.message ||
        nested?.description ||
        nested?.message ||
        (typeof json?.error === 'string' ? json.error : null) ||
        res.statusText ||
        'Failed to fetch';
      return { error: message, status: res.status };
    }

    return { data: json as T, status: res.status };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch' };
  }
}
