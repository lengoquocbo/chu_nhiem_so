"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { ConfirmModal } from "@/lib/ui/Modal";

type ToastApi = { show: (m: string, kind?: "success" | "error" | "info") => void };

const TEACHER_ROLES = ["subject_teacher", "principal"];
const TEACHER_MENU: AppMenuItem[] = [
  { id: "join", label: "Tham gia lớp", description: "Dùng mã lớp được cấp", icon: "link", roles: TEACHER_ROLES },
  { id: "lessonbook", label: "Sổ đầu bài", description: "Tiết học, điểm danh và đánh giá", icon: "clipboard", roles: TEACHER_ROLES },
  { id: "assessment-scores", label: "Quản lý điểm kiểm tra", description: "Điểm dò bài và 15 phút", icon: "chart", roles: TEACHER_ROLES },
];

export default function TeacherPage() {
  const guard = useRoleGuard(TEACHER_ROLES);
  const [activeSection, setActiveSection] = useState("lessonbook");
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;

  const selected = TEACHER_MENU.find((item) => item.id === activeSection) || TEACHER_MENU[0];

  return (
    <ToastProvider>
      <AppShell
        title={selected.label}
        subtitle="Không gian làm việc của Giáo viên bộ môn"
        currentPath="/teacher"
        menuItems={TEACHER_MENU}
        activeItem={activeSection}
        onMenuSelect={setActiveSection}
      >
        <TeacherContent activeSection={activeSection} />
      </AppShell>
    </ToastProvider>
  );
}

function TeacherContent({ activeSection }: { activeSection: string }) {
  const toast = useToast();
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [academicTermId, setAcademicTermId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");

  async function loadMyClasses() {
    try {
      const result = await callApiGet("/api/teacher/context");
      const rows = result.scopes || [];
      setMyClasses(rows);
      const preferred = rows.find((row: any) => row.school_year_status === "active" && row.term_status === "active") || rows[0];
      setSchoolYearId(preferred?.school_year_id || "");
      setAcademicTermId(preferred?.academic_term_id || "");
      setAssignmentId(preferred?.assignment_id || "");
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }
  useEffect(() => { loadMyClasses(); }, []);

  const yearOptions = Array.from(new Map(myClasses.map((row: any) => [row.school_year_id, { id: row.school_year_id, name: row.school_year_name }])).values());
  const termOptions = Array.from(new Map(myClasses.filter((row: any) => row.school_year_id === schoolYearId).map((row: any) => [row.academic_term_id, { id: row.academic_term_id, name: row.term_name, status: row.term_status }])).values());
  const assignmentOptions = myClasses.filter((row: any) => row.academic_term_id === academicTermId);
  const selectedAssignment = myClasses.find((item) => item.assignment_id === assignmentId);
  const classId = selectedAssignment?.class_id || "";
  const readOnly = selectedAssignment?.term_status !== "active" || selectedAssignment?.class_term_status !== "active";

  function changeYear(nextYearId: string) {
    setSchoolYearId(nextYearId);
    const next = myClasses.find((row: any) => row.school_year_id === nextYearId);
    setAcademicTermId(next?.academic_term_id || "");
    setAssignmentId(next?.assignment_id || "");
  }

  function changeTerm(nextTermId: string) {
    setAcademicTermId(nextTermId);
    setAssignmentId(myClasses.find((row: any) => row.academic_term_id === nextTermId)?.assignment_id || "");
  }

  return (
    <>
      {activeSection === "join" && <Section title="Tham gia lớp bằng mã lớp">
        <JoinClass toast={toast} onJoined={loadMyClasses} />
      </Section>}

      {activeSection !== "join" && myClasses.length > 0 && (
        <div className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
          <div><label className="field-label">Năm học</label><select className="field-input w-44" value={schoolYearId} onChange={(e) => changeYear(e.target.value)}>{yearOptions.map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
          <div><label className="field-label">Học kỳ</label><select className="field-input w-40" value={academicTermId} onChange={(e) => changeTerm(e.target.value)}>{termOptions.map((term: any) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
          <div><label className="field-label">Lớp · Môn dạy</label><select className="field-input w-64" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            {assignmentOptions.map((c: any) => (
              <option key={c.assignment_id} value={c.assignment_id}>{c.class_name} · {c.subject_name}</option>
            ))}
          </select></div>
          <span className={readOnly ? "badge-neutral" : "badge-add"}>{readOnly ? "Chỉ xem" : "Đang hoạt động"}</span>
        </div>
      )}

      {classId && (
        <>
          {activeSection === "lessonbook" && <TeacherLessonBook classId={classId} subjectId={selectedAssignment?.subject_id} academicTermId={academicTermId} readOnly={readOnly} toast={toast} />}
          {activeSection === "assessment-scores" && <TeacherAssessmentScores classId={classId} subjectId={selectedAssignment?.subject_id} subjectName={selectedAssignment?.subject_name} academicTermId={academicTermId} termStartDate={selectedAssignment?.term_start_date || ""} termEndDate={selectedAssignment?.term_end_date || ""} readOnly={readOnly} toast={toast} />}
        </>
      )}
      {activeSection !== "join" && myClasses.length === 0 && <EmptyState message="Bạn chưa có lớp đang dạy. Chọn ‘Tham gia lớp’ để thêm lớp bằng mã được cấp." />}
    </>
  );
}

const TODAY = () => new Date().toLocaleDateString("en-CA");
const RATING_OPTIONS = ["Tốt", "Khá", "Đạt", "Chưa đạt"];

function TeacherLessonBook({ classId, subjectId, academicTermId, readOnly, toast }: { classId: string; subjectId?: string; academicTermId: string; readOnly: boolean; toast: ToastApi }) {
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

function TeacherAssessmentScores({ classId, subjectId, subjectName, academicTermId, termStartDate, termEndDate, readOnly, toast }: { classId: string; subjectId?: string; subjectName?: string; academicTermId: string; termStartDate: string; termEndDate: string; readOnly: boolean; toast: ToastApi }) {
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

    {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setShowAdd(false)}><form onSubmit={addScore} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Thêm điểm 15 phút</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Học sinh</label><select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></div><div><label className="field-label">Điểm (0–10)</label><input type="number" min={0} max={10} step="0.25" className="field-input" value={score} onChange={(e) => setScore(e.target.value)} required /></div><div><label className="field-label">Ngày kiểm tra</label><input type="date" className="field-input" min={termStartDate} max={termEndDate} value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} required /></div><div><label className="field-label">Tiết (không bắt buộc)</label><input type="number" min={1} max={15} className="field-input" value={period} onChange={(e) => setPeriod(e.target.value)} /></div><div><label className="field-label">Nhận xét</label><input className="field-input" value={comment} onChange={(e) => setComment(e.target.value)} /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Hủy</button><button className="btn-primary">Lưu điểm</button></div></form></div>}

    {showAddOral && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setShowAddOral(false)}><form onSubmit={addOralScore} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Thêm điểm dò bài</h3><p className="mt-1 text-sm text-ink-muted">Chọn một tiết đang mở do bạn phụ trách. Điểm sẽ tự gắn với ngày, tiết và môn học đó.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Tiết học</label><select className="field-input" value={manualOralLessonId} onChange={(e) => setManualOralLessonId(e.target.value)} required>{oralLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{new Date(`${lesson.lesson_date}T00:00:00`).toLocaleDateString("vi-VN")} · Tiết {lesson.period}</option>)}</select></div><div className="sm:col-span-2"><label className="field-label">Học sinh</label><select className="field-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name} · {student.student_code}</option>)}</select></div><div><label className="field-label">Điểm (0–10)</label><input type="number" min={0} max={10} step="0.25" className="field-input" value={manualOralScore} onChange={(e) => setManualOralScore(e.target.value)} required /></div><div><label className="field-label">Nhận xét</label><input className="field-input" value={manualOralComment} onChange={(e) => setManualOralComment(e.target.value)} /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowAddOral(false)}>Hủy</button><button className="btn-primary">Lưu điểm dò bài</button></div></form></div>}

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setDetail(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-xl">Chi tiết điểm {detail.score.score}</h3><p className="text-sm text-ink-muted">{detail.score.students?.full_name} · {detail.score.assessment_type === "oral" ? "Dò bài cũ" : "Kiểm tra 15 phút"}</p></div>{readOnly || detail.score.competition_weeks?.status === "locked" ? <span className="badge-neutral">Chỉ xem</span> : detail.score.teacher_id === currentUserId ? <button type="button" className="btn-primary" onClick={() => setEditTarget(detail.score)}>Chỉnh sửa</button> : <span className="badge-neutral">Do giáo viên khác nhập</span>}</div><dl className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">Ngày kiểm tra</dt><dd>{new Date(`${detail.score.assessment_date}T00:00:00`).toLocaleDateString("vi-VN")}{detail.score.period ? ` · Tiết ${detail.score.period}` : ""}</dd></div><div><dt className="text-xs text-ink-muted">Giáo viên nhập</dt><dd>{detail.score.profiles?.full_name || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Nhận xét</dt><dd>{detail.score.comment || "—"}</dd></div></dl><h4 className="mt-5 font-medium">Lịch sử</h4><div className="mt-2 space-y-2">{detail.history.map((item: any) => <div key={item.id} className="rounded border border-line p-3 text-sm"><div>{item.action === "create" ? `Tạo điểm ${item.new_score}` : `Sửa ${item.old_score} → ${item.new_score}`} · {item.profiles?.full_name || "—"}</div><div className="text-xs text-ink-muted">{new Date(item.changed_at).toLocaleString("vi-VN")}{item.reason ? ` · Lý do: ${item.reason}` : ""}</div></div>)}</div><div className="mt-5 flex justify-end"><button type="button" className="btn-secondary" onClick={() => setDetail(null)}>Đóng</button></div></div></div>}

    {editTarget && <ConfirmModal title="Chỉnh sửa điểm kiểm tra" description="GVBM có thể sửa điểm mình nhập mà không cần lý do. Điểm cũ, người sửa và thời gian vẫn được giữ trong lịch sử." fields={[{ key: "score", label: "Điểm mới (0–10)", type: "number", defaultValue: editTarget.score, required: true }, { key: "comment", label: "Nhận xét", defaultValue: editTarget.comment || "" }]} confirmLabel="Lưu chỉnh sửa" onCancel={() => setEditTarget(null)} onConfirm={updateScore} />}
  </Section>;
}

function JoinClass({ toast, onJoined }: { toast: ToastApi; onJoined: () => void }) {
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

const ATTENDANCE_OPTIONS = [
  { value: "present", label: "Có mặt" },
  { value: "late", label: "Đi muộn" },
  { value: "unexcused_absent", label: "Vắng không phép" },
  { value: "excused_absent", label: "Vắng có phép" },
  { value: "left_early", label: "Về sớm" },
  { value: "skipped", label: "Bỏ tiết" },
];

const STATUS_BADGE: Record<string, string> = {
  present: "badge-add",
  late: "badge-gold",
  unexcused_absent: "badge-deduct",
  excused_absent: "badge-neutral",
  left_early: "badge-deduct",
  skipped: "badge-deduct",
};

function Attendance({ classId, subjectId, toast }: { classId: string; subjectId?: string; toast: ToastApi }) {
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

function RecordEvent({ classId, toast }: { classId: string; toast: ToastApi }) {
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
