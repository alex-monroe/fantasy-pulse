export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(input, init);
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
