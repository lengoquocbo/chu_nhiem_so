"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import type { ToastApi } from "./shared";

export function JoinClass({ toast, onJoined }: { toast: ToastApi; onJoined: () => void }) {
  const [classCode, setClassCode] = useState("");
const [joining, setJoining] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("subjects").select("*").eq("status", "active").order("name").then(({ data }) => setSubjects(data || []));
  }, []);

async function join(e: React.FormEvent) {
  e.preventDefault();
  setJoining(true);
  try {
    await callApi("/api/teacher/join-class", { class_code: classCode, subject_id: subjectId });
    toast.show("Đã tham gia lớp.", "success");
    setClassCode("");
    await onJoined();
  } catch (err: any) {
    toast.show(`Lỗi: ${err.message}`, "error");
  } finally {
    setJoining(false);
  }
}

  return (
    <form onSubmit={join} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="field-label">Mã lớp</label>
        <input className="field-input w-40 uppercase" placeholder="A1X8K2" value={classCode} onChange={(e) => setClassCode(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Môn dạy</label>
        <select className="field-input w-44" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
          <option value="">-- Chọn --</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn-primary" disabled={joining}>{joining ? "Đang tham gia..." : "Tham gia"}</button>
    </form>
  );
}
