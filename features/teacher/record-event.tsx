"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section } from "@/lib/ui/Section";

import type { ToastApi } from "./shared";

export function RecordEvent({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [criteriaList, setCriteriaList] = useState<any[]>([]);
  const [studentId, setStudentId] = useState("");
  const [criteriaCode, setCriteriaCode] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase
      .from("student_class_enrollments")
      .select("students(id, full_name)")
      .eq("class_id", classId)
      .is("left_at", null)
      .then(({ data }) => setStudents((data || []).map((r: any) => r.students).filter(Boolean)));
    supabase.from("criteria").select("*").eq("class_id", classId).eq("status", "active").order("code").then(({ data }) => setCriteriaList(data || []));
  }, [classId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await callApi("/api/events", { student_id: studentId, class_id: classId, event_type_code: "CRITERIA_RECORD", criteria_code: criteriaCode, event_date: new Date().toISOString().slice(0, 10), note });
      toast.show("Đã ghi nhận sự việc.", "success");
      setNote("");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title="Ghi nhận cộng / trừ điểm" description="Chọn tiêu chí — hệ thống tự lấy mức điểm đã được GVCN cấu hình.">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Học sinh</label>
          <select className="field-input w-48" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Tiêu chí thi đua</label>
          <select className="field-input w-72" value={criteriaCode} onChange={(e) => setCriteriaCode(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {criteriaList.map((criteria) => (
              <option key={criteria.id} value={criteria.code}>
                {criteria.code} · {criteria.name} ({Number(criteria.points) === 0 ? "0" : `${criteria.kind === "ADD" ? "+" : "−"}${criteria.points}`})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Ghi chú</label>
          <input className="field-input w-52" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">Ghi nhận</button>
      </form>
    </Section>
  );
}
