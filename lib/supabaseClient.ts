import { createClient } from "@supabase/supabase-js";

export const API_ACTIVITY_EVENT = "school-api-activity";

type ApiActivity = { pending: number; mutations: number };
const activity: ApiActivity = { pending: 0, mutations: 0 };
const directRequests = new Map<string, Promise<Response>>();
const apiGetRequests = new Map<string, Promise<any>>();
const apiMutationRequests = new Map<string, Promise<any>>();

function emitActivity() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ApiActivity>(API_ACTIVITY_EVENT, { detail: { ...activity } }));
  }
}

function beginActivity(isMutation: boolean) {
  activity.pending += 1;
  if (isMutation) activity.mutations += 1;
  emitActivity();
}

function endActivity(isMutation: boolean) {
  activity.pending = Math.max(0, activity.pending - 1);
  if (isMutation) activity.mutations = Math.max(0, activity.mutations - 1);
  emitActivity();
}

/** Dedupe request Supabase giống hệt đang chạy; clone Response cho từng consumer. */
async function dedupingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const bodyKey = typeof init?.body === "string" ? init.body : "";
  const requestHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const headerKey = Array.from(requestHeaders.entries()).sort(([left], [right]) => left.localeCompare(right));
  const key = `${method}:${String(input)}:${JSON.stringify(headerKey)}:${bodyKey}`;
  const existing = directRequests.get(key);
  if (existing) return (await existing).clone();

  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  beginActivity(isMutation);
  const request = fetch(input, init);
  directRequests.set(key, request);
  try {
    return (await request).clone();
  } finally {
    directRequests.delete(key);
    endActivity(isMutation);
  }
}

// Dùng PUBLISHABLE key ở đây (hệ key mới, thay cho anon key cũ) - an toàn để
// lộ ra browser vì mọi bảng đều có RLS (xem supabase/migrations/006_rls.sql).
// Không bao giờ đưa SECRET key vào frontend.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

/** Production gọi thẳng FastAPI trên Render; local giữ /api để Next.js proxy sang uvicorn. */
export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: dedupingFetch } });

type CurrentAccess = { user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]; roles: string[] };
let accessCache: { value: CurrentAccess; expiresAt: number } | null = null;
let accessRequest: Promise<CurrentAccess> | null = null;

/** User + role dùng chung cho RoleGuard và AppShell, tránh hai truy vấn giống nhau. */
export function getCurrentAccess(): Promise<CurrentAccess> {
  if (accessCache && accessCache.expiresAt > Date.now()) return Promise.resolve(accessCache.value);
  if (accessRequest) return accessRequest;
  accessRequest = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, roles: [] };
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (error) throw error;
    return { user, roles: (data || []).map((row: any) => row.role) };
  })();
  return accessRequest.then((value) => {
    accessCache = { value, expiresAt: Date.now() + 30_000 };
    return value;
  }).finally(() => { accessRequest = null; });
}

export function clearCurrentAccessCache() {
  accessCache = null;
  accessRequest = null;
}

/** Gọi 1 API Python (Vercel Function) kèm sẵn access_token của user hiện tại. */
export function callApi(path: string, body: unknown) {
  const serializedBody = JSON.stringify(body);
  const key = `${path}:${serializedBody}`;
  const existing = apiMutationRequests.get(key);
  if (existing) return existing;

  beginActivity(true);
  const request = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(apiUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: serializedBody,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "API error");
    }
    return res.json();
  })();
  apiMutationRequests.set(key, request);
  return request.finally(() => {
    apiMutationRequests.delete(key);
    endActivity(true);
  });
}

export function callApiGet(path: string) {
  const existing = apiGetRequests.get(path);
  if (existing) return existing;

  beginActivity(false);
  const request = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        res = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 150 * (2 ** attempt)));
        continue;
      }
      if (![502, 503, 504].includes(res.status) || attempt === 2) break;
      await new Promise((resolve) => window.setTimeout(resolve, 150 * (2 ** attempt)));
    }
    if (!res) throw new Error("Không thể kết nối API.");
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    if (!res.ok) throw new Error(data.detail || "API error");
    return data;
  })();
  apiGetRequests.set(path, request);
  return request.finally(() => {
    apiGetRequests.delete(path);
    endActivity(false);
  });
}
