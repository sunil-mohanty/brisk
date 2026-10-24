"use client";

const TOKEN_KEY = "salon_token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// Last response per GET path. Pages show it instantly, then refresh in the background.
// Any change (POST/PUT/PATCH/DELETE) or sign-in/out empties it, so edits never show stale data.
const cache = new Map<string, unknown>();
export const clearCache = () => cache.clear();

export const auth = {
  get: () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => { cache.clear(); window.localStorage.setItem(TOKEN_KEY, t); },
  clear: () => { cache.clear(); window.localStorage.removeItem(TOKEN_KEY); },
};

function detail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "message" in d) return String((d as { message: unknown }).message);
    // FastAPI validation errors: [{loc, msg}]
    if (Array.isArray(d) && d[0]?.msg) {
      const field = d[0].loc?.slice(-1)[0];
      return field ? `${String(field).replace(/_/g, " ")}: ${d[0].msg}` : d[0].msg;
    }
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = auth.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const payload = body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body);
  if (method !== "GET") cache.clear();
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/public")) {
      auth.clear();
      window.location.href = "/login";
    }
    const code = data && typeof data.detail === "object" && data.detail && "code" in data.detail ? String(data.detail.code) : undefined;
    throw new ApiError(res.status, detail(data, `Something went wrong (${res.status}). Try again.`), code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  /** Calls apply() at once with the cached copy (if any), then again with fresh data. */
  swr: <T>(path: string, apply: (data: T) => void): Promise<void> => {
    if (cache.has(path)) apply(cache.get(path) as T);
    return request<T>("GET", path).then((d) => {
      cache.set(path, d);
      apply(d);
    });
  },
  /** Fetches into the cache without showing anything, so the next visit is instant. */
  prefetch: (path: string) => {
    if (!cache.has(path)) request<unknown>("GET", path).then((d) => cache.set(path, d)).catch(() => {});
  },
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T = void>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>("POST", path, fd);
  },
};

/** Downloads an authenticated file (QR PNG, quote PDF) through the browser. */
export async function download(path: string, filename: string) {
  const token = auth.get();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, "Download failed. Try again.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
