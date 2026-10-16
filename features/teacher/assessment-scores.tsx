"use client";

import { useEffect, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import { TODAY } from "./shared";
import type { ToastApi } from "./shared";

export function TeacherAssessmentScores({ classId, subjectId, subjectName, academicTermId, termStartDate, termEndDate, readOnly, toast }: { classId: string; subjectId?: string; subjectName?: string; academicTermId: string; termStartDate: string; termEndDate: string; readOnly: boolean; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddOral, setShowAddOral] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [score, setScore] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(TODAY());
  const [period, setPeriod] = useState("");
  const [comment, setComment] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [oralLessons, setOralLessons] = useState<any[]>([]);
  const [manualOralLessonId, setManualOralLessonId] = useState("");
  const [manualOralScore, setManualOralScore] = useState("");
  const [manualOralComment, setManualOralComment] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || ""));
  }, []);

  async function load() {
    if (!subjectId) return;
    try {
      const result = await callApiGet(`/api/assessments?class_id=${encodeURIComponent(classId)}&subject_id=${encodeURIComponent(subjectId)}&academic_term_id=${encodeURIComponent(academicTermId)}`);
      setStudents(result.students || []); setScores(result.scores || []);
      if (result.students?.[0]) setStudentId((current) => current || result.students[0].id);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }
  useEffect(() => { setStudentId(""); load(); }, [classId, subjectId, academicTermId]);

  useEffect(() => {
    if (termStartDate && termEndDate && (assessmentDate < termStartDate || assessmentDate > termEndDate)) {
      setAssessmentDate(termStartDate);
    }
  }, [termStartDate, termEndDate]);

  useEffect(() => {
    if (!subjectId || !currentUserId) return;
    callApiGet(`/api/assessments/oral/lessons?class_id=${encodeURIComponent(classId)}&subject_id=${encodeURIComponent(subjectId)}&academic_term_id=${encodeURIComponent(academicTermId)}`)
      .then((result) => { setOralLessons(result.lessons || []); setManualOralLessonId(result.lessons?.[0]?.id || ""); })
      .catch((err: any) => toast.show(`Lỗi: ${err.message}`, "error"));
  }, [classId, subjectId, academicTermId, currentUserId]);

  async function addScore(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) return;
    try {
      await callApi("/api/assessments/fifteen-minute", { class_id: classId, subject_id: subjectId, academic_term_id: academicTermId, student_id: studentId, score: Number(score), assessment_date: assessmentDate, period: period ? Number(period) : null, comment });
      toast.show("Đã thêm điểm 15 phút.", "success");
      setShowAdd(false); setScore(""); setComment(""); setPeriod(""); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function addOralScore(e: React.FormEvent) {
    e.preventDefault();
    if (!manualOralLessonId) return;
    try {
      await callApi("/api/assessments/oral", { class_id: classId, lesson_id: manualOralLessonId, student_id: studentId, score: Number(manualOralScore), comment: manualOralComment });
      toast.show("Đã thêm điểm dò bài.", "success");
      setShowAddOral(false); setManualOralScore(""); setManualOralComment(""); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function openDetail(scoreId: string) {
    try { setDetail(await callApiGet(`/api/assessments/${scoreId}?class_id=${encodeURIComponent(classId)}`)); }
    catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function updateScore(values: Record<string, string>) {
    if (!editTarget) return;
    try {
      await callApi(`/api/assessments/${editTarget.id}/update`, { class_id: classId, score: Number(values.score), comment: values.comment, reason: values.reason });
      toast.show("Đã chỉnh sửa điểm và lưu lịch sử.", "success");
      setEditTarget(null); setDetail(null); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  function scoreChips(student: any, type: string) {
    const items = scores.filter((item) => item.student_id === student.id && item.assessment_type === type);
    if (!items.length) return <span className="text-ink-faint">—</span>;
    return <div className="flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-1"><button type="button" className="badge-neutral hover:border-navy" title="Xem chi tiết điểm" onClick={() => openDetail(item.id)}>{item.score}</button>{!readOnly && item.teacher_id === currentUserId && item.competition_weeks?.status !== "locked" && <button type="button" className="text-xs font-medium text-navy hover:underline" onClick={() => setEditTarget(item)}>Sửa</button>}</span>)}</div>;
  }

  return <Section title={`Quản lý điểm kiểm tra · ${subjectName || "Môn học"}`} description="Mỗi điểm là một bản ghi riêng. Bấm vào điểm để xem ngày kiểm tra, giáo viên, nhận xét và lịch sử chỉnh sửa.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">{readOnly ? <span className="text-sm text-ink-muted">Học kỳ đã đóng: dữ liệu chỉ được xem.</span> : <span /> }<div className="flex gap-2"><button type="button" className="btn-secondary" disabled={readOnly || !oralLessons.length} onClick={() => setShowAddOral(true)}>Thêm điểm dò bài</button><button type="button" className="btn-primary" disabled={readOnly} onClick={() => setShowAdd(true)}>Thêm điểm 15 phút</button></div></div>
    {students.length === 0 ? <EmptyState message="Lớp chưa có học sinh." /> : <table className="data-table"><thead><tr><th>Họ và tên học sinh</th><th>Ngày sinh</th><th>Điểm dò bài</th><th>Điểm 15 phút</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="font-medium">{student.full_name}<div className="text-xs font-normal text-ink-muted">{student.student_code}</div></td><td>{student.date_of_birth ? new Date(`${student.date_of_birth}T00:00:00`).toLocaleDateString("vi-VN") : "—"}</td><td>{scoreChips(student, "oral")}</td><td>{scoreChips(student, "fifteen_minute")}</td></tr>)}</tbody></table>}

    {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setShowAdd(false)}><form onSubmit={addScore} className="teacher-score-dialog w-full max-w-lg rounded-lg bg-white p-4 shadow-lg sm:p-6" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Thêm điểm 15 phút</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Học sinh</label><select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></div><div><label className="field-label">Điểm (0–10)</label><input type="number" min={0} max={10} step="0.25" className="field-input" value={score} onChange={(e) => setScore(e.target.value)} required /></div><div><label className="field-label">Ngày kiểm tra</label><input type="date" className="field-input" min={termStartDate} max={termEndDate} value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} required /></div><div><label className="field-label">Tiết (không bắt buộc)</label><input type="number" min={1} max={15} className="field-input" value={period} onChange={(e) => setPeriod(e.target.value)} /></div><div><label className="field-label">Nhận xét</label><input className="field-input" value={comment} onChange={(e) => setComment(e.target.value)} /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Hủy</button><button className="btn-primary">Lưu điểm</button></div></form></div>}

    {showAddOral && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setShowAddOral(false)}><form onSubmit={addOralScore} className="teacher-score-dialog w-full max-w-lg rounded-lg bg-white p-4 shadow-lg sm:p-6" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Thêm điểm dò bài</h3><p className="mt-1 text-sm text-ink-muted">Chọn một tiết đang mở do bạn phụ trách. Điểm sẽ tự gắn với ngày, tiết và môn học đó.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Tiết học</label><select className="field-input" value={manualOralLessonId} onChange={(e) => setManualOralLessonId(e.target.value)} required>{oralLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{new Date(`${lesson.lesson_date}T00:00:00`).toLocaleDateString("vi-VN")} · Tiết {lesson.period}</option>)}</select></div><div className="sm:col-span-2"><label className="field-label">Học sinh</label><select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} · {student.student_code}</option>)}</select></div><div><label className="field-label">Điểm (0–10)</label><input type="number" min={0} max={10} step="0.25" className="field-input" value={manualOralScore} onChange={(e) => setManualOralScore(e.target.value)} required /></div><div><label className="field-label">Nhận xét</label><input className="field-input" value={manualOralComment} onChange={(e) => setManualOralComment(e.target.value)} /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowAddOral(false)}>Hủy</button><button className="btn-primary">Lưu điểm dò bài</button></div></form></div>}

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setDetail(null)}><div className="teacher-score-dialog w-full max-w-2xl rounded-lg bg-white p-4 shadow-lg sm:p-6" onClick={(e) => e.stopPropagation()}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-xl">Chi tiết điểm {detail.score.score}</h3><p className="text-sm text-ink-muted">{detail.score.students?.full_name} · {detail.score.assessment_type === "oral" ? "Dò bài cũ" : "Kiểm tra 15 phút"}</p></div>{readOnly || detail.score.competition_weeks?.status === "locked" ? <span className="badge-neutral">Chỉ xem</span> : detail.score.teacher_id === currentUserId ? <button type="button" className="btn-primary" onClick={() => setEditTarget(detail.score)}>Chỉnh sửa</button> : <span className="badge-neutral">Do giáo viên khác nhập</span>}</div><dl className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">Ngày kiểm tra</dt><dd>{new Date(`${detail.score.assessment_date}T00:00:00`).toLocaleDateString("vi-VN")}{detail.score.period ? ` · Tiết ${detail.score.period}` : ""}</dd></div><div><dt className="text-xs text-ink-muted">Giáo viên nhập</dt><dd>{detail.score.profiles?.full_name || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Nhận xét</dt><dd>{detail.score.comment || "—"}</dd></div></dl><h4 className="mt-5 font-medium">Lịch sử</h4><div className="mt-2 space-y-2">{detail.history.map((item: any) => <div key={item.id} className="rounded border border-line p-3 text-sm"><div>{item.action === "create" ? `Tạo điểm ${item.new_score}` : `Sửa ${item.old_score} → ${item.new_score}`} · {item.profiles?.full_name || "—"}</div><div className="text-xs text-ink-muted">{new Date(item.changed_at).toLocaleString("vi-VN")}{item.reason ? ` · Lý do: ${item.reason}` : ""}</div></div>)}</div><div className="mt-5 flex justify-end"><button type="button" className="btn-secondary" onClick={() => setDetail(null)}>Đóng</button></div></div></div>}

    {editTarget && <ConfirmModal title="Chỉnh sửa điểm kiểm tra" description="GVBM có thể sửa điểm mình nhập mà không cần lý do. Điểm cũ, người sửa và thời gian vẫn được giữ trong lịch sử." fields={[{ key: "score", label: "Điểm mới (0–10)", type: "number", defaultValue: editTarget.score, required: true }, { key: "comment", label: "Nhận xét", defaultValue: editTarget.comment || "" }]} confirmLabel="Lưu chỉnh sửa" onCancel={() => setEditTarget(null)} onConfirm={updateScore} />}
  </Section>;
}
