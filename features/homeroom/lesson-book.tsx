"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

const WEEKDAY_LABELS: Record<number, string> = { 1: "Thứ Hai", 2: "Thứ Ba", 3: "Thứ Tư", 4: "Thứ Năm", 5: "Thứ Sáu", 6: "Thứ Bảy", 7: "Chủ Nhật" };
const LESSON_RATINGS = ["Tốt", "Khá", "Đạt", "Chưa đạt"];

export function HomeroomLessonBook({ classId, academicTermId, toast, onUnlockRequestsChange }: { classId: string; academicTermId: string; toast: ToastApi; onUnlockRequestsChange: () => void }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekId, setWeekId] = useState("");
  const [week, setWeek] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [weekday, setWeekday] = useState(1);
  const [period, setPeriod] = useState(1);
  const [assignmentIndex, setAssignmentIndex] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<any | null>(null);
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
  const [unlockRequests, setUnlockRequests] = useState<any[]>([]);
  const [processingUnlockId, setProcessingUnlockId] = useState<string | null>(null);
  const unlockReviewRef = useRef(false);

  useEffect(() => {
    supabase.from("competition_weeks").select("*").eq("class_id", classId).eq("academic_term_id", academicTermId).order("week_number").then(({ data }) => {
      const rows = data || [];
      setWeeks(rows);
      const today = new Date().toLocaleDateString("en-CA");
      const current = rows.find((item) => item.start_date <= today && item.end_date >= today) || rows.find((item) => item.status === "open") || rows[0];
      setWeekId(current?.id || "");
    });
  }, [classId, academicTermId]);

  async function loadManagement() {
    try {
      const [timetable, requests] = await Promise.all([
        callApiGet(`/api/lesson-book/timetable?class_id=${encodeURIComponent(classId)}`),
        callApiGet(`/api/lesson-book/unlock/requests?class_id=${encodeURIComponent(classId)}&academic_term_id=${encodeURIComponent(academicTermId)}`),
      ]);
      setSchedule(timetable.entries || []);
      setAssignments(timetable.assignments || []);
      setAssignmentIndex((current) => current || (timetable.assignments?.length ? "0" : ""));
      setUnlockRequests(requests.requests || []);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function loadLessons() {
    if (!weekId) { setLessons([]); return; }
    try {
      const result = await callApiGet(`/api/lesson-book/entries?class_id=${encodeURIComponent(classId)}&week_id=${encodeURIComponent(weekId)}`);
      setWeek(result.week); setLessons(result.lessons || []);
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }
  useEffect(() => { loadManagement(); }, [classId, academicTermId]);
  useEffect(() => { loadLessons(); }, [weekId]);

  function resetScheduleForm() { setEditingScheduleId(null); setWeekday(1); setPeriod(1); setAssignmentIndex(assignments.length ? "0" : ""); }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    const assignment = assignments[Number(assignmentIndex)];
    if (!assignment) return;
    try {
      await callApi("/api/lesson-book/timetable/save", { class_id: classId, entry_id: editingScheduleId, weekday, period, subject_id: assignment.subject_id, teacher_id: assignment.teacher_id });
      toast.show(editingScheduleId ? "Đã cập nhật thời khóa biểu; thay đổi áp dụng từ ngày mai." : "Đã thêm tiết vào thời khóa biểu.", "success");
      resetScheduleForm(); await loadManagement(); await loadLessons();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  function editSchedule(item: any) {
    const index = assignments.findIndex((assignment) => assignment.teacher_id === item.teacher_id && assignment.subject_id === item.subject_id);
    setEditingScheduleId(item.id); setWeekday(item.weekday); setPeriod(item.period); setAssignmentIndex(index >= 0 ? String(index) : "");
  }

  async function deleteSchedule() {
    try {
      await callApi("/api/lesson-book/timetable/delete", { class_id: classId, entry_id: deleteScheduleTarget.id });
      toast.show("Đã ngừng tiết trong thời khóa biểu từ ngày mai.", "success"); setDeleteScheduleTarget(null); loadManagement(); loadLessons();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function reviewExtra(lessonId: string, approve: boolean) {
    try {
      await callApi("/api/lesson-book/extra/review", { class_id: classId, lesson_id: lessonId, approve });
      toast.show(approve ? "Đã duyệt tiết phát sinh." : "Đã từ chối tiết phát sinh.", "success"); loadLessons();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function reviewUnlock(requestId: string, approve: boolean) {
    if (unlockReviewRef.current) return;
    unlockReviewRef.current = true;
    setProcessingUnlockId(requestId);
    try {
      await callApi("/api/lesson-book/unlock/review", { class_id: classId, request_id: requestId, approve });
      toast.show(approve ? "Đã duyệt mở khóa tuần." : "Đã từ chối yêu cầu.", "success");
      await Promise.all([loadManagement(), loadLessons()]);
      onUnlockRequestsChange();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { unlockReviewRef.current = false; setProcessingUnlockId(null); }
  }

  async function saveLesson(e: React.FormEvent) {
    e.preventDefault();
    try {
      await callApi("/api/lesson-book/entries/update", { class_id: classId, lesson_id: editingLesson.id, lecture_content: editingLesson.lecture_content, collective_rating: editingLesson.collective_rating, collective_comment: editingLesson.collective_comment, notes: editingLesson.notes });
      toast.show("Đã điều chỉnh tiết học.", "success"); setEditingLesson(null); loadLessons();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  return <div className="space-y-7">
    <Section title="Cấu hình thời khóa biểu" description="GVCN/Admin cấu hình theo lớp. Khi sửa, các tiết đã học được giữ nguyên và lịch mới áp dụng từ ngày mai.">
      <form onSubmit={saveSchedule} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
        <div><label className="field-label">Thứ</label><select className="field-input w-32" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{Object.entries(WEEKDAY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label className="field-label">Tiết</label><input type="number" min={1} max={15} className="field-input w-20" value={period} onChange={(e) => setPeriod(Number(e.target.value))} required /></div>
        <div><label className="field-label">Môn · GVBM</label><select className="field-input w-72" value={assignmentIndex} onChange={(e) => setAssignmentIndex(e.target.value)} required><option value="">-- Chọn phân công --</option>{assignments.map((assignment, index) => <option key={`${assignment.teacher_id}-${assignment.subject_id}`} value={index}>{assignment.subjects?.name} · {assignment.profiles?.full_name}</option>)}</select></div>
        <button className="btn-primary">{editingScheduleId ? "Lưu thay đổi" : "Thêm vào lịch"}</button>{editingScheduleId && <button type="button" className="btn-ghost" onClick={resetScheduleForm}>Hủy sửa</button>}
      </form>
      {schedule.length === 0 ? <EmptyState message="Chưa có thời khóa biểu. Hãy phân công GVBM vào lớp trước." /> : <table className="data-table mt-5"><thead><tr><th>Thứ</th><th>Tiết</th><th>Môn</th><th>GVBM</th><th>Hiệu lực</th><th></th></tr></thead><tbody>{schedule.map((item) => <tr key={item.id}><td>{WEEKDAY_LABELS[item.weekday]}</td><td>{item.period}</td><td>{item.subjects?.name}</td><td>{item.profiles?.full_name}</td><td>{item.effective_from}</td><td className="whitespace-nowrap"><button type="button" className="btn-ghost" onClick={() => editSchedule(item)}>Sửa</button>{" "}<button type="button" className="btn-ghost text-red-700" onClick={() => setDeleteScheduleTarget(item)}>Xóa</button></td></tr>)}</tbody></table>}
    </Section>

    <Section title="Sổ đầu bài theo tuần">
      <div className="mb-4 flex items-end gap-3"><div><label className="field-label">Tuần</label><select className="field-input w-48" value={weekId} onChange={(e) => setWeekId(e.target.value)}>{weeks.map((item) => <option key={item.id} value={item.id}>Tuần {item.week_number} · {item.status === "locked" ? "Đã khóa" : "Đang mở"}</option>)}</select></div>{week && <span className={week.status === "locked" ? "badge-neutral" : "badge-add"}>{week.status === "locked" ? "Đã khóa" : "Đang mở"}</span>}</div>
      {lessons.length === 0 ? <EmptyState message="Chưa có tiết học trong tuần này." /> : <table className="data-table"><thead><tr><th>Ngày</th><th>Tiết</th><th>Môn/GVBM</th><th>Bài giảng</th><th>Sĩ số</th><th>Xếp loại</th><th>Đánh giá tập thể</th><th>Ghi chú</th><th></th></tr></thead><tbody>{lessons.map((lesson) => <tr key={lesson.id}><td>{lesson.lesson_date}</td><td>{lesson.period}{lesson.source === "extra" && <span className="ml-1 badge-gold">Phát sinh</span>}</td><td>{lesson.subjects?.name}<div className="text-xs text-ink-muted">{lesson.profiles?.full_name}</div></td><td>{lesson.lecture_content || "—"}</td><td>{lesson.attendance_summary}</td><td>{lesson.collective_rating || "—"}</td><td>{lesson.collective_comment || "—"}</td><td>{lesson.notes || "—"}</td><td className="whitespace-nowrap">{lesson.approval_status === "pending" ? <><button type="button" className="btn-secondary" onClick={() => reviewExtra(lesson.id, true)}>Duyệt</button>{" "}<button type="button" className="btn-ghost" onClick={() => reviewExtra(lesson.id, false)}>Từ chối</button></> : lesson.approval_status === "rejected" ? <span className="badge-deduct">Đã từ chối</span> : <button type="button" className="btn-ghost" disabled={week?.status !== "open"} onClick={() => setEditingLesson({ ...lesson })}>Điều chỉnh</button>}</td></tr>)}</tbody></table>}
    </Section>

    {unlockRequests.length > 0 && <Section title={`Yêu cầu mở khóa (${unlockRequests.length})`}><table className="data-table"><thead><tr><th>Tuần</th><th>GVBM</th><th>Lý do</th><th>Thời gian</th><th></th></tr></thead><tbody>{unlockRequests.map((request) => <tr key={request.id}><td>Tuần {request.competition_weeks?.week_number}</td><td>{request.profiles?.full_name}</td><td>{request.reason}</td><td>{new Date(request.created_at).toLocaleString("vi-VN")}</td><td><button type="button" className="btn-secondary" disabled={processingUnlockId !== null} onClick={() => reviewUnlock(request.id, true)}>{processingUnlockId === request.id ? "Đang xử lý..." : "Duyệt"}</button>{" "}<button type="button" className="btn-ghost" disabled={processingUnlockId !== null} onClick={() => reviewUnlock(request.id, false)}>{processingUnlockId === request.id ? "Đang xử lý..." : "Từ chối"}</button></td></tr>)}</tbody></table></Section>}

    {editingLesson && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setEditingLesson(null)}><form onSubmit={saveLesson} className="w-full max-w-xl rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-lg">Điều chỉnh tiết học</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><label className="field-label">Bài giảng</label><input className="field-input" value={editingLesson.lecture_content || ""} onChange={(e) => setEditingLesson({ ...editingLesson, lecture_content: e.target.value })} /></div><div><label className="field-label">Xếp loại</label><select className="field-input" value={editingLesson.collective_rating || ""} onChange={(e) => setEditingLesson({ ...editingLesson, collective_rating: e.target.value })}><option value="">-- Chọn --</option>{LESSON_RATINGS.map((rating) => <option key={rating}>{rating}</option>)}</select></div><div><label className="field-label">Đánh giá tập thể</label><input className="field-input" value={editingLesson.collective_comment || ""} onChange={(e) => setEditingLesson({ ...editingLesson, collective_comment: e.target.value })} /></div><div className="sm:col-span-2"><label className="field-label">Ghi chú</label><textarea className="field-input" value={editingLesson.notes || ""} onChange={(e) => setEditingLesson({ ...editingLesson, notes: e.target.value })} /></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setEditingLesson(null)}>Hủy</button><button className="btn-primary">Lưu điều chỉnh</button></div></form></div>}
    {deleteScheduleTarget && <ConfirmModal title="Xóa tiết khỏi thời khóa biểu" description="Các tiết đã học được giữ nguyên; thay đổi chỉ áp dụng cho ngày tương lai." confirmLabel="Xóa khỏi lịch" danger onCancel={() => setDeleteScheduleTarget(null)} onConfirm={deleteSchedule} />}
  </div>;
}
