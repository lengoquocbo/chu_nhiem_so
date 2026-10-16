"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import { TODAY, ATTENDANCE_OPTIONS } from "./shared";
import type { ToastApi } from "./shared";

const RATING_OPTIONS = ["Tốt", "Khá", "Đạt", "Chưa đạt"];

export function TeacherLessonBook({ classId, subjectId, academicTermId, readOnly, toast }: { classId: string; subjectId?: string; academicTermId: string; readOnly: boolean; toast: ToastApi }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekId, setWeekId] = useState("");
  const [selectedDate, setSelectedDate] = useState(TODAY());
  const [lessons, setLessons] = useState<any[]>([]);
  const [week, setWeek] = useState<any>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<any | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<Record<string, { status: string; note: string; criteriaIds: string[] }>>({});
  const [showExtra, setShowExtra] = useState(false);
  const [extraDate, setExtraDate] = useState(TODAY());
  const [extraPeriod, setExtraPeriod] = useState(1);
  const [extraReason, setExtraReason] = useState("");
  const [unlockWeekId, setUnlockWeekId] = useState<string | null>(null);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const unlockSubmittingRef = useRef(false);
  const [oralLesson, setOralLesson] = useState<any | null>(null);
  const [oralPick, setOralPick] = useState<any | null>(null);
  const [oralScore, setOralScore] = useState("");
  const [oralComment, setOralComment] = useState("");
  const [oralLoading, setOralLoading] = useState(false);
  const [oralStudents, setOralStudents] = useState<any[]>([]);
  const [oralManualMode, setOralManualMode] = useState(false);

  useEffect(() => {
    supabase.from("competition_weeks").select("*").eq("class_id", classId).eq("academic_term_id", academicTermId).order("week_number").then(({ data }) => {
      const rows = data || [];
      setWeeks(rows);
      const today = TODAY();
      const current = rows.find((item) => item.start_date <= today && item.end_date >= today) || rows.find((item) => item.status === "open") || rows[0];
      setWeekId(current?.id || "");
      if (current && !(current.start_date <= today && current.end_date >= today)) setSelectedDate(current.start_date);
    });
  }, [classId, academicTermId]);

  async function load() {
    if (!weekId) return;
    try {
      const result = await callApiGet(`/api/lesson-book/entries?class_id=${encodeURIComponent(classId)}&week_id=${encodeURIComponent(weekId)}&subject_id=${encodeURIComponent(subjectId || "")}&academic_term_id=${encodeURIComponent(academicTermId)}`);
      setLessons(result.lessons || []);
      setWeek(result.week);
      if (result.week && (selectedDate < result.week.start_date || selectedDate > result.week.end_date)) setSelectedDate(result.week.start_date);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }
  useEffect(() => { load(); }, [weekId]);

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    try {
      await callApi("/api/lesson-book/entries/update", { class_id: classId, lesson_id: editing.id, lecture_content: editing.lecture_content, collective_rating: editing.collective_rating, collective_comment: editing.collective_comment, notes: editing.notes });
      toast.show("Đã cập nhật tiết học.", "success"); setEditing(null); load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function openAttendance(lesson: any) {
    try {
      const data = await callApiGet(`/api/lesson-book/attendance?class_id=${encodeURIComponent(classId)}&lesson_id=${encodeURIComponent(lesson.id)}`);
      const records = new Map((data.records || []).map((row: any) => [row.student_id, row]));
      const selections: Record<string, string[]> = {};
      (data.selections || []).forEach((row: any) => { selections[row.student_id] = [...(selections[row.student_id] || []), row.criteria_id]; });
      const initial: Record<string, { status: string; note: string; criteriaIds: string[] }> = {};
      (data.students || []).forEach((student: any) => {
        const record: any = records.get(student.id);
        initial[student.id] = { status: record?.attendance_status || "present", note: record?.note || "", criteriaIds: selections[student.id] || [] };
      });
      setAttendance(data); setAttendanceRows(initial);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  function toggleStudentCriteria(studentId: string, criteriaId: string) {
    setAttendanceRows((previous) => {
      const row = previous[studentId];
      const criteriaIds = row.criteriaIds.includes(criteriaId) ? row.criteriaIds.filter((id) => id !== criteriaId) : [...row.criteriaIds, criteriaId];
      return { ...previous, [studentId]: { ...row, criteriaIds } };
    });
  }

  async function completeAttendance() {
    try {
      await callApi("/api/lesson-book/attendance/save", { class_id: classId, lesson_id: attendance.lesson.id, rows: attendance.students.map((student: any) => ({ student_id: student.id, attendance_status: attendanceRows[student.id].status, note: attendanceRows[student.id].note, criteria_ids: attendanceRows[student.id].criteriaIds })) });
      toast.show("Đã hoàn thành điểm danh và gửi đánh giá cá nhân cho GVCN duyệt.", "success");
      setAttendance(null); load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function createExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) return;
    try {
      await callApi("/api/lesson-book/extra/request", { class_id: classId, subject_id: subjectId, academic_term_id: academicTermId, lesson_date: extraDate, period: extraPeriod, reason: extraReason });
      toast.show("Đã gửi tiết phát sinh cho GVCN xác nhận.", "success"); setShowExtra(false); setExtraReason(""); load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function requestUnlock(reason: string) {
    if (unlockSubmittingRef.current || !unlockWeekId) return;
    unlockSubmittingRef.current = true;
    setUnlockSubmitting(true);
    try {
      await callApi("/api/lesson-book/unlock/request", { class_id: classId, week_id: unlockWeekId, reason });
      toast.show("Đã gửi yêu cầu mở khóa cho GVCN.", "success"); setUnlockWeekId(null);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { unlockSubmittingRef.current = false; setUnlockSubmitting(false); }
  }

  async function spinOral(lesson: any = oralLesson) {
    if (!lesson) return;
    setOralLoading(true);
    try {
      const result = await callApiGet(`/api/assessments/oral/random?class_id=${encodeURIComponent(classId)}&lesson_id=${encodeURIComponent(lesson.id)}`);
      setOralLesson(lesson); setOralPick(result); setOralScore(""); setOralComment("");
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setOralLoading(false); }
  }

  async function openOralLesson(lesson: any) {
    setOralLesson(lesson); setOralPick(null); setOralScore(""); setOralComment(""); setOralManualMode(false);
    const { data, error } = await supabase.from("student_class_enrollments").select("students(id,student_code,full_name)").eq("class_id", classId).is("left_at", null);
    if (error) toast.show(`Lỗi: ${error.message}`, "error");
    setOralStudents((data || []).map((row: any) => row.students).filter(Boolean));
  }

  async function chooseOralStudent(studentId: string) {
    if (!oralLesson || !studentId) { setOralPick(null); return; }
    setOralLoading(true);
    try {
      const result = await callApiGet(`/api/assessments/oral/student?class_id=${encodeURIComponent(classId)}&lesson_id=${encodeURIComponent(oralLesson.id)}&student_id=${encodeURIComponent(studentId)}`);
      setOralPick(result); setOralScore(""); setOralComment("");
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setOralLoading(false); }
  }

  async function saveOralScore(e: React.FormEvent) {
    e.preventDefault();
    if (!oralLesson || !oralPick || oralScore === "") return;
    try {
      await callApi("/api/assessments/oral", { class_id: classId, lesson_id: oralLesson.id, student_id: oralPick.student.id, score: Number(oralScore), comment: oralComment });
      toast.show(`Đã lưu điểm dò bài của ${oralPick.student.full_name}.`, "success");
      setOralLesson(null); setOralPick(null);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  const dayLessons = lessons.filter((lesson) => lesson.lesson_date === selectedDate && lesson.teacher_id && (!subjectId || lesson.subject_id === subjectId));

  return <Section title="Sổ đầu bài điện tử" description="Lớp → Tuần → Ngày → Tiết học">
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div><label className="field-label">Tuần</label><select className="field-input w-44" value={weekId} onChange={(e) => setWeekId(e.target.value)}>{weeks.map((item) => <option key={item.id} value={item.id}>Tuần {item.week_number} · {item.status === "locked" ? "Đã khóa" : "Đang mở"}</option>)}</select></div>
      <div><label className="field-label">Ngày học</label><input type="date" className="field-input" min={week?.start_date} max={week?.end_date} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div>
      {!readOnly && (week?.status === "open" ? <button type="button" className="btn-secondary" onClick={() => { setExtraDate(selectedDate); setShowExtra(true); }}>Thêm tiết phát sinh</button> : <button type="button" className="btn-secondary" onClick={() => setUnlockWeekId(weekId)}>Yêu cầu mở khóa</button>)}
    </div>
    {dayLessons.length === 0 ? <EmptyState message="Không có tiết nào được phân công cho bạn trong ngày này." /> : <table className="data-table">
      <thead><tr><th>Tiết</th><th>Môn</th><th>Bài giảng</th><th>Sĩ số</th><th>Xếp loại</th><th>Đánh giá tập thể</th><th>Đánh giá cá nhân</th><th>Ghi chú</th><th></th></tr></thead>
      <tbody>{dayLessons.map((lesson) => <tr key={lesson.id}>
        <td>{lesson.period}{lesson.source === "extra" && <span className="ml-1 badge-gold">Phát sinh</span>}</td><td>{lesson.subjects?.name}</td>
        <td>{lesson.lecture_content || "—"}</td><td>{lesson.attendance_summary}</td><td>{lesson.collective_rating || "—"}</td><td>{lesson.collective_comment || "—"}</td>
        <td>{lesson.approval_status === "pending" ? <span className="badge-gold">Chờ GVCN duyệt</span> : <button type="button" className="btn-ghost" disabled={readOnly || week?.status !== "open"} onClick={() => openAttendance(lesson)}>Điểm danh / Đánh giá</button>}</td>
        <td>{lesson.notes || "—"}</td><td className="whitespace-nowrap"><button type="button" className="btn-ghost" disabled={readOnly || week?.status !== "open" || lesson.approval_status !== "approved"} onClick={() => openOralLesson(lesson)}>Dò bài cũ</button>{" "}<button type="button" className="btn-ghost" disabled={readOnly || week?.status !== "open" || lesson.approval_status !== "approved"} onClick={() => setEditing({ ...lesson })}>Cập nhật</button></td>
      </tr>)}</tbody>
    </table>}

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setEditing(null)}><form onSubmit={saveLesson} className="w-full max-w-xl rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <h3 className="font-serif text-lg">Cập nhật tiết {editing.period}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Bài giảng</label><input className="field-input" value={editing.lecture_content || ""} onChange={(e) => setEditing({ ...editing, lecture_content: e.target.value })} /></div>
      <div><label className="field-label">Xếp loại tập thể</label><select className="field-input" value={editing.collective_rating || ""} onChange={(e) => setEditing({ ...editing, collective_rating: e.target.value })}><option value="">-- Chọn --</option>{RATING_OPTIONS.map((rating) => <option key={rating}>{rating}</option>)}</select></div>
      <div><label className="field-label">Đánh giá tập thể</label><input className="field-input" value={editing.collective_comment || ""} onChange={(e) => setEditing({ ...editing, collective_comment: e.target.value })} /></div>
      <div className="sm:col-span-2"><label className="field-label">Ghi chú</label><textarea className="field-input" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div></div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Hủy</button><button className="btn-primary">Lưu</button></div>
    </form></div>}

    {showExtra && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setShowExtra(false)}><form onSubmit={createExtra} className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-lg">Thêm tiết phát sinh</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="field-label">Ngày</label><input type="date" className="field-input" value={extraDate} onChange={(e) => setExtraDate(e.target.value)} required /></div><div><label className="field-label">Tiết</label><input type="number" min={1} max={15} className="field-input" value={extraPeriod} onChange={(e) => setExtraPeriod(Number(e.target.value))} required /></div><div className="sm:col-span-2"><label className="field-label">Lý do</label><textarea className="field-input" value={extraReason} onChange={(e) => setExtraReason(e.target.value)} required /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowExtra(false)}>Hủy</button><button className="btn-primary">Gửi GVCN</button></div></form></div>}

    {attendance && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-3" onClick={() => setAttendance(null)}><div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-lg">Điểm danh và đánh giá cá nhân · Tiết {attendance.lesson.period}</h3><p className="mt-1 text-sm text-ink-muted">Mặc định tất cả học sinh có mặt. Có thể chọn nhiều tiêu chí đã bật trong tuần.</p><table className="data-table mt-4"><thead><tr><th>Học sinh</th><th>Điểm danh</th><th>Tiêu chí</th><th>Ghi chú</th></tr></thead><tbody>{attendance.students.map((student: any) => <tr key={student.id}><td className="font-medium">{student.full_name}</td><td><select className="field-input w-40" value={attendanceRows[student.id]?.status || "present"} onChange={(e) => setAttendanceRows({ ...attendanceRows, [student.id]: { ...attendanceRows[student.id], status: e.target.value } })}>{ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td><div className="grid min-w-80 gap-1 sm:grid-cols-2">{attendance.criteria.map((criteria: any) => <label key={criteria.id} className="flex items-start gap-1.5 text-xs"><input type="checkbox" className="mt-0.5" checked={attendanceRows[student.id]?.criteriaIds.includes(criteria.id) || false} onChange={() => toggleStudentCriteria(student.id, criteria.id)} /><span>{criteria.code} · {criteria.name}</span></label>)}</div></td><td><input className="field-input w-44" value={attendanceRows[student.id]?.note || ""} onChange={(e) => setAttendanceRows({ ...attendanceRows, [student.id]: { ...attendanceRows[student.id], note: e.target.value } })} /></td></tr>)}</tbody></table><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAttendance(null)}>Hủy</button><button type="button" className="btn-primary" onClick={completeAttendance}>Hoàn thành điểm danh</button></div></div></div>}

    {oralLesson && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => { setOralLesson(null); setOralPick(null); }}><form onSubmit={saveOralScore} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Dò bài cũ · Tiết {oralLesson.period}</h3><p className="mt-1 text-sm text-ink-muted">Có thể quay ngẫu nhiên hoặc chọn học sinh thủ công để cho điểm.</p><div className="mt-4 flex gap-2"><button type="button" className={!oralManualMode ? "btn-primary" : "btn-secondary"} disabled={oralLoading} onClick={() => { setOralManualMode(false); spinOral(); }}>{oralLoading && !oralManualMode ? "Đang quay..." : !oralManualMode && oralPick ? "Quay lại" : "Quay ngẫu nhiên"}</button><button type="button" className={oralManualMode ? "btn-primary" : "btn-secondary"} onClick={() => { setOralManualMode(true); setOralPick(null); setOralScore(""); setOralComment(""); }}>Chọn thủ công</button></div>{oralManualMode && <div className="mt-4"><label className="field-label">Chọn học sinh</label><select className="field-input" defaultValue="" onChange={(e) => chooseOralStudent(e.target.value)} disabled={oralLoading}><option value="">-- Chọn học sinh --</option>{oralStudents.map((student) => <option key={student.id} value={student.id}>{student.full_name} · {student.student_code}</option>)}</select></div>}{oralPick ? <div className="mt-5"><div className="rounded-lg border border-line bg-paper p-5 text-center"><p className="text-sm text-ink-muted">Học sinh được chọn</p><p className="mt-1 font-serif text-2xl text-ink">{oralPick.student.full_name}</p>{oralPick.previous_count > 0 ? <p className="mt-2 text-sm text-ink-muted">Đã được dò bài {oralPick.previous_count} lần. Điểm gần nhất: <strong>{oralPick.latest_score} điểm</strong>.</p> : <p className="mt-2 text-sm text-ink-muted">Chưa từng được dò bài ở môn này.</p>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="field-label">Điểm (0–10)</label><input type="number" min={0} max={10} step="0.25" className="field-input" value={oralScore} onChange={(e) => setOralScore(e.target.value)} required /></div><div><label className="field-label">Nhận xét</label><input className="field-input" value={oralComment} onChange={(e) => setOralComment(e.target.value)} /></div></div></div> : <p className="mt-6 text-center text-sm text-ink-muted">{oralManualMode ? "Chọn một học sinh để nhập điểm." : "Bấm quay để chọn ngẫu nhiên một học sinh."}</p>}<div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => { setOralLesson(null); setOralPick(null); }}>Bỏ qua</button>{oralPick && <button type="submit" className="btn-primary" disabled={oralScore === ""}>Lưu điểm</button>}</div></form></div>}

    {unlockWeekId && <ConfirmModal title="Yêu cầu mở khóa tuần" description="Nhập lý do cần sửa sổ đầu bài. GVCN sẽ nhận thông báo và duyệt yêu cầu." fields={[{ key: "reason", label: "Lý do", required: true }]} confirmLabel="Gửi yêu cầu" loading={unlockSubmitting} loadingLabel="Đang gửi..." onCancel={() => setUnlockWeekId(null)} onConfirm={(values) => requestUnlock(values.reason)} />}
  </Section>;
}
