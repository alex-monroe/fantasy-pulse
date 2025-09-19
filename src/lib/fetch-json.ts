const DEFAULT_CACHE_DURATION_SECONDS = 1;

type FetchJsonInit = RequestInit & {
  disableCache?: boolean;
};

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchJsonInit = {},
): Promise<{ data?: T; error?: string }> {
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
      const message = json?.error_description || json?.message || json?.error || res.statusText || 'Failed to fetch';
      return { error: message };
    }

    return { data: json as T };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch' };
  }
}
