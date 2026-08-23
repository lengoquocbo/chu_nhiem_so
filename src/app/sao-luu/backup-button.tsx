"use client";
import { useActionState } from "react";
import { createBackupAction } from "./actions";
export function BackupButton() { const [state, action, pending] = useActionState(async () => createBackupAction(), null); return <div><form action={action}><button className="btn btn-primary" disabled={pending}>{pending ? "Đang sao lưu…" : "Sao lưu ngay"}</button></form>{state && <p role="status" className={`mt-2 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}</div>; }