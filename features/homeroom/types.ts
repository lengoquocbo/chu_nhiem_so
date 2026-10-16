export type Option = { id: string; name?: string; full_name?: string; code?: string };
export type ToastApi = { show: (m: string, kind?: "success" | "error" | "info") => void };
