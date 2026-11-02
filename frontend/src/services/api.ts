const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public issues: {path: string; message: string}[] = []) {
    super(message);
  }
}

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let refreshRequest: Promise<unknown> | null = null;
async function requestCsrf() {
  if (csrfToken) return csrfToken;
  let response: Response;
  try { response = await fetch(`${base}/auth/csrf`, { credentials: "include" }); }
  catch { throw new ApiError("Cannot reach FoodieGo server. Please try again later.", 0, "NETWORK_ERROR"); }
  if (!response.ok) throw new ApiError("Could not start a secure session", response.status, "CSRF_FAILED");
  const body = await response.json();
  csrfToken = body.data.csrfToken as string;
  return csrfToken;
}
function getCsrf(): Promise<string> {
  if (csrfToken) return Promise.resolve(csrfToken);
  if (!csrfRequest) csrfRequest = requestCsrf().finally(() => { csrfRequest = null; });
  return csrfRequest;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD"].includes(method)) headers.set("X-CSRF-Token", await getCsrf());
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers, credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError("Cannot reach FoodieGo server. Please try again later.", 0, "NETWORK_ERROR");
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 403 && body.error?.code === "CSRF_REJECTED" && retry) {
    csrfToken = null;
    return api<T>(path, init, false);
  }
  if (response.status === 401 && retry && path !== "/auth/refresh" && path !== "/auth/login") {
    try {
      if (!refreshRequest) refreshRequest = api("/auth/refresh", { method: "POST" }).finally(() => { refreshRequest = null; });
      await refreshRequest;
      return api<T>(path, init, false);
    } catch { /* Preserve original authentication response. */ }
  }
  if (!response.ok) throw new ApiError(body.error?.message || "Request failed", response.status, body.error?.code || "REQUEST_FAILED", body.error?.issues || []);
  return body.data as T;
}
