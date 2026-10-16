"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ATTENDANCE_OPTIONS } from "./shared";
import type { ToastApi } from "./shared";

const STATUS_BADGE: Record<string, string> = {
  present: "badge-add",
  late: "badge-gold",
  unexcused_absent: "badge-deduct",
  excused_absent: "badge-neutral",
  left_early: "badge-deduct",
  skipped: "badge-deduct",
};

export function Attendance({ classId, subjectId, toast }: { classId: string; subjectId?: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState(1);

  useEffect(() => {
    supabase
      .from("student_class_enrollments")
      .select("students(id, full_name)")
      .eq("class_id", classId)
      .is("left_at", null)
      .then(({ data }) => {
        const list = (data || []).map((r: any) => r.students).filter(Boolean);
        setStudents(list);
        const initial: Record<string, string> = {};
        list.forEach((s: any) => (initial[s.id] = "present"));
        setStatuses(initial);
      });
  }, [classId]);

  async function submit() {
    if (!subjectId) {
      toast.show("Thiếu môn học cho lớp này.", "error");
      return;
    }
    try {
      const session = await callApi("/api/attendance/session", { class_id: classId, subject_id: subjectId, session_date: sessionDate, period });
      const records = students.map((s) => ({ student_id: s.id, attendance_status: statuses[s.id] }));
      const result = await callApi("/api/attendance/submit", { session_id: session.id, class_id: classId, records });
      toast.show(`Đã điểm danh: ${result.created.length} mới, ${result.skipped_existing.length} đã có sẵn.`, "success");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title="Điểm danh theo tiết">
      <div className="mb-4 flex items-end gap-3">
        <div>
          <label className="field-label">Ngày</label>
          <input type="date" className="field-input" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Tiết</label>
          <input type="number" min={1} max={10} className="field-input w-16" value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
        </div>
      </div>

      {students.length === 0 ? (
        <EmptyState message="Lớp này chưa có học sinh." />
      ) : (
        <table className="data-table">
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td className="w-1/2">{s.full_name}</td>
                <td>
                  <select
                    className={`field-input w-44 ${statuses[s.id] !== "present" ? "font-medium" : ""}`}
                    value={statuses[s.id] || "present"}
                    onChange={(e) => setStatuses({ ...statuses, [s.id]: e.target.value })}
                  >
                    {ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  {statuses[s.id] && statuses[s.id] !== "present" && (
                    <span className={STATUS_BADGE[statuses[s.id]]}>
                      {ATTENDANCE_OPTIONS.find((o) => o.value === statuses[s.id])?.label}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn-primary mt-5" onClick={submit} disabled={students.length === 0}>
        Xác nhận điểm danh
      </button>
    </Section>
  );
}
