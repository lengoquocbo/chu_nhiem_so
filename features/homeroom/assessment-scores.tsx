"use client";

import { useEffect, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function HomeroomAssessmentScores({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  useEffect(() => {
    supabase.from("class_subject_teachers").select("subject_id, subjects(id,name)").eq("class_id", classId).eq("status", "active").then(({ data }) => {
      const unique = Array.from(new Map((data || []).map((row: any) => [row.subject_id, row.subjects])).values()).filter(Boolean) as any[];
      setSubjects(unique); setSubjectId(unique[0]?.id || "");
    });
  }, [classId]);

  async function load() {
    if (!subjectId) { setStudents([]); setScores([]); return; }
    try {
      const result = await callApiGet(`/api/assessments?class_id=${encodeURIComponent(classId)}&subject_id=${encodeURIComponent(subjectId)}&academic_term_id=${encodeURIComponent(academicTermId)}`);
      setStudents(result.students || []); setScores(result.scores || []);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }
  useEffect(() => { load(); }, [classId, subjectId, academicTermId]);

  async function openDetail(scoreId: string) {
    try { setDetail(await callApiGet(`/api/assessments/${scoreId}?class_id=${encodeURIComponent(classId)}`)); }
    catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function updateScore(values: Record<string, string>) {
    if (!editTarget) return;
    try {
      await callApi(`/api/assessments/${editTarget.id}/update`, { class_id: classId, score: Number(values.score), comment: values.comment, reason: values.reason });
      toast.show("Đã sửa điểm và lưu lịch sử.", "success"); setEditTarget(null); setDetail(null); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  function scoreChips(studentId: string, type: string) {
    const items = scores.filter((item) => item.student_id === studentId && item.assessment_type === type);
    if (!items.length) return <span className="text-ink-faint">—</span>;
    return <div className="flex flex-wrap gap-1.5">{items.map((item) => <button key={item.id} type="button" className={item.competition_weeks?.status === "locked" ? "badge-neutral" : "badge-add"} onClick={() => openDetail(item.id)} title="Xem chi tiết điểm">{item.score}</button>)}</div>;
  }

  return <Section title="Quản lý điểm kiểm tra" description="Chọn môn để xem điểm dò bài và điểm 15 phút của toàn bộ học sinh trong lớp. GVCN có thể sửa khi tuần chưa khóa.">
    <div className="mb-5 max-w-sm"><label className="field-label">Môn học</label><select className="field-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">-- Chọn môn --</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div>
    {!subjectId ? <EmptyState message="Lớp chưa có môn học được phân công." /> : students.length === 0 ? <EmptyState message="Lớp chưa có học sinh." /> : <table className="data-table"><thead><tr><th>Họ và tên học sinh</th><th>Ngày tháng năm sinh</th><th>Điểm dò bài</th><th>Điểm 15 phút</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="font-medium">{student.full_name}<div className="text-xs font-normal text-ink-muted">{student.student_code}</div></td><td>{student.date_of_birth ? new Date(`${student.date_of_birth}T00:00:00`).toLocaleDateString("vi-VN") : "—"}</td><td>{scoreChips(student.id, "oral")}</td><td>{scoreChips(student.id, "fifteen_minute")}</td></tr>)}</tbody></table>}

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setDetail(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-xl">Chi tiết điểm {detail.score.score}</h3><p className="text-sm text-ink-muted">{detail.score.students?.full_name} · {detail.score.subjects?.name} · {detail.score.assessment_type === "oral" ? "Dò bài cũ" : "Kiểm tra 15 phút"}</p></div>{detail.score.competition_weeks?.status === "locked" ? <span className="badge-neutral">Tuần đã khóa</span> : <button type="button" className="btn-primary" onClick={() => setEditTarget(detail.score)}>Chỉnh sửa</button>}</div><dl className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">Ngày kiểm tra</dt><dd>{new Date(`${detail.score.assessment_date}T00:00:00`).toLocaleDateString("vi-VN")}{detail.score.period ? ` · Tiết ${detail.score.period}` : ""}</dd></div><div><dt className="text-xs text-ink-muted">Giáo viên nhập</dt><dd>{detail.score.profiles?.full_name || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Nhận xét</dt><dd>{detail.score.comment || "—"}</dd></div></dl><h4 className="mt-5 font-medium">Lịch sử chỉnh sửa</h4><div className="mt-2 space-y-2">{detail.history.map((item: any) => <div key={item.id} className="rounded border border-line p-3 text-sm"><div>{item.action === "create" ? `Tạo điểm ${item.new_score}` : `Sửa ${item.old_score} → ${item.new_score}`} · {item.profiles?.full_name || "—"}</div><div className="text-xs text-ink-muted">{new Date(item.changed_at).toLocaleString("vi-VN")}{item.reason ? ` · Lý do: ${item.reason}` : ""}</div></div>)}</div><div className="mt-5 flex justify-end"><button type="button" className="btn-secondary" onClick={() => setDetail(null)}>Đóng</button></div></div></div>}

    {editTarget && <ConfirmModal title="GVCN chỉnh sửa điểm kiểm tra" description="Phải nhập lý do; hệ thống giữ điểm cũ, người sửa và thời gian sửa." fields={[{ key: "score", label: "Điểm mới (0–10)", type: "number", defaultValue: editTarget.score, required: true }, { key: "comment", label: "Nhận xét", defaultValue: editTarget.comment || "" }, { key: "reason", label: "Lý do chỉnh sửa", required: true }]} confirmLabel="Lưu chỉnh sửa" onCancel={() => setEditTarget(null)} onConfirm={updateScore} />}
  </Section>;
}
