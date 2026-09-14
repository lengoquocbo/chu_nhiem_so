"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { ConfirmModal } from "@/lib/ui/Modal";
import { ClassCommunications } from "@/lib/ui/ClassCommunications";

type Option = { id: string; name?: string; full_name?: string; code?: string };
type HomeroomScope = { class_term_id: string; class_id: string; class_name: string; class_code: string; school_year_id: string; school_year_name: string; school_year_status: string; academic_term_id: string; term_name: string; term_number: number; term_start_date: string; term_end_date: string; term_status: string };

const HOMEROOM_ROLES = ["homeroom_teacher", "principal"];
const HOMEROOM_MENU: AppMenuItem[] = [
  { id: "classmanage", label: "Quản lý lớp học", description: "Danh sách học sinh", icon: "school", roles: HOMEROOM_ROLES, group: "Quản lý" },
  { id: "students", label: "Import học sinh", description: "Import bằng Excel", icon: "upload", roles: HOMEROOM_ROLES, group: "Quản lý" },
  { id: "accounts", label: "Tài khoản học sinh", description: "Học sinh và phụ huynh", icon: "users", roles: HOMEROOM_ROLES, group: "Quản lý" },
  { id: "groups", label: "Quản lý tổ", description: "Phân tổ học sinh", icon: "groups", roles: HOMEROOM_ROLES, group: "Quản lý" },
  { id: "officers", label: "Ban cán sự", description: "Phân quyền trong lớp", icon: "shield", roles: HOMEROOM_ROLES, group: "Quản lý" },
  { id: "forum", label: "Diễn đàn thông báo", description: "Thông tin chính thức của lớp", icon: "clipboard", roles: HOMEROOM_ROLES, group: "Liên lạc" },
  { id: "feedback", label: "Góp ý – phản hồi", description: "Tiếp nhận góp ý ẩn danh", icon: "users", roles: HOMEROOM_ROLES, group: "Liên lạc" },
  { id: "parent-reports", label: "Báo cáo phụ huynh", description: "Gửi kết quả tuần qua email", icon: "clipboard", roles: HOMEROOM_ROLES, group: "Liên lạc" },
  { id: "lessonbook", label: "Sổ đầu bài", description: "Thời khóa biểu và tiết học", icon: "clipboard", roles: HOMEROOM_ROLES, group: "Sự kiện" },
  { id: "competition", label: "Thành tích thi đua", description: "Xếp hạng và xác nhận điểm", icon: "chart", roles: HOMEROOM_ROLES, group: "Sự kiện" },
  { id: "assessment-scores", label: "Điểm kiểm tra", description: "Điểm dò bài và 15 phút", icon: "clipboard", roles: HOMEROOM_ROLES, group: "Sự kiện" },
  { id: "criteria", label: "Tiêu chí thi đua", description: "Cấu hình cộng trừ điểm", icon: "settings", roles: HOMEROOM_ROLES, group: "Sự kiện" },
  { id: "weeks", label: "Tuần thi đua", description: "Chốt và mở khóa tuần", icon: "calendar", roles: HOMEROOM_ROLES, group: "Sự kiện" },
  { id: "approvals", label: "Duyệt điểm", description: "Giao dịch đang chờ", icon: "check", roles: HOMEROOM_ROLES, group: "Sự kiện" },
];

export default function HomeroomPage() {
  const guard = useRoleGuard(HOMEROOM_ROLES);
  const [activeSection, setActiveSection] = useState("classmanage");
  const [communicationUnread, setCommunicationUnread] = useState({ forum: 0, feedback: 0 });
  const [unlockRequestCount, setUnlockRequestCount] = useState(0);
  async function loadCommunicationUnread() {
    try { setCommunicationUnread(await callApiGet("/api/communications/unread")); }
    catch { setCommunicationUnread({ forum: 0, feedback: 0 }); }
  }
  async function loadUnlockRequestCount() {
    try {
      const result = await callApiGet("/api/lesson-book/unlock/pending-count");
      setUnlockRequestCount(result.count || 0);
    } catch { setUnlockRequestCount(0); }
  }
  useEffect(() => {
    if (guard !== "allowed") return;
    const refreshNotifications = () => { loadCommunicationUnread(); loadUnlockRequestCount(); };
    refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [guard]);
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;

  const menuItems = HOMEROOM_MENU.map((item) => item.id === "forum" ? { ...item, badgeCount: communicationUnread.forum } : item.id === "feedback" ? { ...item, badgeCount: communicationUnread.feedback } : item.id === "lessonbook" ? { ...item, badgeCount: unlockRequestCount } : item);
  const selected = menuItems.find((item) => item.id === activeSection) || menuItems[0];

  return (
    <ToastProvider>
      <AppShell
        title={selected.label}
        subtitle="Không gian làm việc của Giáo viên chủ nhiệm"
        currentPath="/homeroom"
        menuItems={menuItems}
        activeItem={activeSection}
        onMenuSelect={setActiveSection}
      >
        <HomeroomContent activeSection={activeSection} onUnreadChange={loadCommunicationUnread} onUnlockRequestsChange={loadUnlockRequestCount} />
      </AppShell>
    </ToastProvider>
  );
}

function HomeroomContent({ activeSection, onUnreadChange, onUnlockRequestsChange }: { activeSection: string; onUnreadChange: () => void; onUnlockRequestsChange: () => void }) {
  const toast = useToast();
  const [scopes, setScopes] = useState<HomeroomScope[]>([]);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [academicTermId, setAcademicTermId] = useState("");
  const [classId, setClassId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await callApiGet("/api/homeroom/context");
        const rows: HomeroomScope[] = result.scopes || [];
        setScopes(rows);
        const preferred = rows.find((row) => row.school_year_status === "active" && row.term_status === "active") || rows[0];
        setSchoolYearId(preferred?.school_year_id || "");
        setAcademicTermId(preferred?.academic_term_id || "");
        setClassId(preferred?.class_id || "");
      } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    })();
  }, []);

  const yearOptions = Array.from(new Map(scopes.map((row) => [row.school_year_id, { id: row.school_year_id, name: row.school_year_name, status: row.school_year_status }])).values());
  const termOptions = Array.from(new Map(scopes.filter((row) => row.school_year_id === schoolYearId).map((row) => [row.academic_term_id, { id: row.academic_term_id, name: row.term_name, status: row.term_status }])).values());
  const classOptions = Array.from(new Map(scopes.filter((row) => row.academic_term_id === academicTermId).map((row) => [row.class_id, { id: row.class_id, name: row.class_name }])).values());
  const selectedScope = scopes.find((row) => row.class_id === classId && row.academic_term_id === academicTermId);

  function changeYear(nextYearId: string) {
    const next = scopes.find((row) => row.school_year_id === nextYearId && row.term_status === "active") || scopes.find((row) => row.school_year_id === nextYearId);
    setSchoolYearId(nextYearId); setAcademicTermId(next?.academic_term_id || ""); setClassId(next?.class_id || "");
  }
  function changeTerm(nextTermId: string) {
    const next = scopes.find((row) => row.academic_term_id === nextTermId);
    setAcademicTermId(nextTermId); setClassId(next?.class_id || "");
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
        <div><label className="field-label">Năm học</label><select className="field-input w-44" value={schoolYearId} onChange={(e) => changeYear(e.target.value)}>{yearOptions.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
        <div><label className="field-label">Học kỳ</label><select className="field-input w-40" value={academicTermId} onChange={(e) => changeTerm(e.target.value)}>{termOptions.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
        <div><label className="field-label">Lớp chủ nhiệm</label><select className="field-input w-40" value={classId} onChange={(e) => setClassId(e.target.value)}>{classOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        {selectedScope && <span className={selectedScope.term_status === "active" ? "badge-add" : "badge-neutral"}>{selectedScope.term_status === "active" ? "Đang hoạt động" : "Chỉ xem"}</span>}
      </div>

      {classId && selectedScope && selectedScope.term_status !== "active" && (
        <Section title="Học kỳ đã khóa" description={`${selectedScope.term_name} không còn hoạt động.`}>
          <div className="rounded-lg border border-deduct/30 bg-deduct-bg p-5 text-sm text-deduct">
            Toàn bộ quyền Giáo viên chủ nhiệm trong học kỳ này đã bị khóa. Hãy chọn một học kỳ đang hoạt động để tiếp tục quản lý lớp.
          </div>
        </Section>
      )}

      {classId && selectedScope?.term_status === "active" && (
        <>
          {activeSection === "classmanage" && <ClassManagement classId={classId} toast={toast} />}
          {activeSection === "students" && <ImportStudents classId={classId} toast={toast} />}
          {activeSection === "accounts" && <StudentAccounts classId={classId} toast={toast} />}
          {activeSection === "forum" && <ClassCommunications classId={classId} view="forum" termStartDate={selectedScope.term_start_date} termEndDate={selectedScope.term_end_date} readOnly={selectedScope.term_status !== "active"} onUnreadChange={onUnreadChange} />}
          {activeSection === "feedback" && <ClassCommunications classId={classId} view="feedback" termStartDate={selectedScope.term_start_date} termEndDate={selectedScope.term_end_date} readOnly={selectedScope.term_status !== "active"} onUnreadChange={onUnreadChange} />}
          {activeSection === "parent-reports" && <ParentReports classId={classId} academicTermId={academicTermId} toast={toast} />}
          {activeSection === "lessonbook" && <HomeroomLessonBook classId={classId} academicTermId={academicTermId} toast={toast} onUnlockRequestsChange={onUnlockRequestsChange} />}
          {activeSection === "competition" && <ClassCompetition classId={classId} schoolYearId={schoolYearId} academicTermId={academicTermId} termStartDate={selectedScope.term_start_date} termEndDate={selectedScope.term_end_date} toast={toast} />}
          {activeSection === "assessment-scores" && <HomeroomAssessmentScores classId={classId} academicTermId={academicTermId} toast={toast} />}
          {activeSection === "criteria" && <Criteria classId={classId} toast={toast} />}
          {activeSection === "groups" && <Groups classId={classId} toast={toast} />}
          {activeSection === "officers" && <ClassOfficers classId={classId} toast={toast} />}
          {activeSection === "weeks" && <Weeks classId={classId} schoolYearId={schoolYearId} academicTermId={academicTermId} termStartDate={selectedScope.term_start_date} termEndDate={selectedScope.term_end_date} toast={toast} />}
          {activeSection === "approvals" && <PendingApprovals classId={classId} academicTermId={academicTermId} toast={toast} />}
        </>
      )}
    </>
  );
}

const WEEKDAY_LABELS: Record<number, string> = { 1: "Thứ Hai", 2: "Thứ Ba", 3: "Thứ Tư", 4: "Thứ Năm", 5: "Thứ Sáu", 6: "Thứ Bảy", 7: "Chủ Nhật" };
const LESSON_RATINGS = ["Tốt", "Khá", "Đạt", "Chưa đạt"];

function HomeroomLessonBook({ classId, academicTermId, toast, onUnlockRequestsChange }: { classId: string; academicTermId: string; toast: ToastApi; onUnlockRequestsChange: () => void }) {
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

function HomeroomAssessmentScores({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
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

function ClassCompetition({ classId, schoolYearId, academicTermId, termStartDate, termEndDate, toast }: { classId: string; schoolYearId: string; academicTermId: string; termStartDate: string; termEndDate: string; toast: ToastApi }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekId, setWeekId] = useState("");
  const [periodType, setPeriodType] = useState<"week" | "month" | "term" | "year">("week");
  const [monthKey, setMonthKey] = useState(termStartDate.slice(0, 7));
  const [students, setStudents] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [rankConfigs, setRankConfigs] = useState<any[]>([]);
  const [weekCriteriaOptions, setWeekCriteriaOptions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [rankFilter, setRankFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score_desc");
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [criteriaDrafts, setCriteriaDrafts] = useState<Record<string, string[]>>({});
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; points: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    supabase.from("competition_weeks").select("*").eq("class_id", classId).eq("school_year_id", schoolYearId).order("week_number").then(({ data }) => {
      const rows = data || [];
      setWeeks(rows);
      const today = new Date().toLocaleDateString("en-CA");
      const termRows = rows.filter((item) => item.academic_term_id === academicTermId);
      const current = termRows.find((item) => item.start_date <= today && item.end_date >= today) || termRows.find((item) => item.status === "open") || termRows[0];
      setWeekId(current?.id || "");
      const currentMonth = today >= termStartDate && today <= termEndDate ? today.slice(0, 7) : termStartDate.slice(0, 7);
      setMonthKey(currentMonth);
    });
  }, [classId, schoolYearId, academicTermId, termStartDate, termEndDate]);

  async function load() {
    const [studentResult, txResult, classRankResult, globalRankResult] = await Promise.all([
      supabase.from("student_class_enrollments").select("students(id,student_code,full_name)").eq("class_id", classId).is("left_at", null),
      supabase.from("score_transactions").select("*, students(full_name,student_code), competition_weeks!inner(id,week_number,start_date,end_date,status,school_year_id,academic_term_id), student_events(criteria_id,event_date,lesson_id,lesson_book_entries(lesson_date,period,subjects(name)))").eq("class_id", classId).eq("competition_weeks.school_year_id", schoolYearId).order("created_at", { ascending: false }),
      supabase.from("rank_configs").select("*").eq("class_id", classId).order("order_index"),
      supabase.from("rank_configs").select("*").is("class_id", null).order("order_index"),
    ]);
    const weekCriteriaResult = weekId ? await supabase.from("competition_week_criteria").select("criteria_id, criteria(*)").eq("week_id", weekId) : { data: [] };
    setStudents((studentResult.data || []).map((row: any) => row.students).filter(Boolean));
    setTransactions(txResult.data || []);
    setRankConfigs((classRankResult.data || []).length ? classRankResult.data || [] : globalRankResult.data || []);
    setWeekCriteriaOptions((weekCriteriaResult.data || []).map((row: any) => row.criteria).filter((criteria: any) => criteria?.status === "active"));
  }
  useEffect(() => { load(); }, [classId, schoolYearId, weekId]);

  const termWeeks = weeks.filter((item) => item.academic_term_id === academicTermId);
  const selectedWeek = weeks.find((item) => item.id === weekId);
  const pendingStatuses = ["DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW"];
  const approvedStatuses = ["APPROVED", "ADJUSTED", "LOCKED"];
  const monthOptions = useMemo(() => {
    if (!termStartDate || !termEndDate) return [];
    const result: { value: string; label: string }[] = [];
    const cursor = new Date(`${termStartDate.slice(0, 7)}-01T00:00:00`);
    const last = termEndDate.slice(0, 7);
    while (cursor.toLocaleDateString("en-CA").slice(0, 7) <= last) {
      const value = cursor.toLocaleDateString("en-CA").slice(0, 7);
      result.push({ value, label: `Tháng ${cursor.getMonth() + 1}/${cursor.getFullYear()}` });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }, [termStartDate, termEndDate]);

  const periodTransactions = useMemo(() => transactions.filter((tx) => {
    if (periodType === "year") return true;
    if (periodType === "term") return tx.competition_weeks?.academic_term_id === academicTermId;
    if (periodType === "week") return tx.week_id === weekId;
    const eventDate = tx.student_events?.event_date || tx.created_at?.slice(0, 10) || "";
    return tx.competition_weeks?.academic_term_id === academicTermId && eventDate.startsWith(monthKey);
  }), [transactions, periodType, academicTermId, weekId, monthKey]);

  const periodWeeks = useMemo(() => {
    if (periodType === "year") return weeks;
    if (periodType === "term") return termWeeks;
    if (periodType === "week") return selectedWeek ? [selectedWeek] : [];
    return termWeeks.filter((week) => week.start_date.slice(0, 7) === monthKey || week.end_date.slice(0, 7) === monthKey);
  }, [weeks, termWeeks, selectedWeek, periodType, monthKey]);
  const periodIsOfficial = periodWeeks.length > 0 && periodWeeks.every((week) => week.status === "locked");

  const ranking = useMemo(() => {
    const rows = students.map((student) => {
      const items = periodTransactions.filter((tx) => tx.student_id === student.id && tx.status !== "REJECTED");
      const officialItems = items.filter((tx) => approvedStatuses.includes(tx.status));
      const points = officialItems.map((tx) => Number(tx.adjusted_points ?? tx.system_points));
      const totalAdd = points.filter((point) => point > 0).reduce((sum, point) => sum + point, 0);
      const totalDeduct = points.filter((point) => point < 0).reduce((sum, point) => sum + Math.abs(point), 0);
      const score = 100 + totalAdd - totalDeduct;
      const pending = items.filter((tx) => pendingStatuses.includes(tx.status));
      const pendingPoints = pending.reduce((sum, tx) => sum + Number(tx.adjusted_points ?? tx.system_points), 0);
      const projectedScore = score + pendingPoints;
      const errors = officialItems.filter((tx) => Number(tx.adjusted_points ?? tx.system_points) < 0);
      const achievements = officialItems.filter((tx) => Number(tx.adjusted_points ?? tx.system_points) > 0);
      const rank = rankConfigs.find((config) => score >= Number(config.min_score) && score <= Number(config.max_score));
      return { ...student, items, officialItems, totalAdd, totalDeduct, score, projectedScore, pending, errors, achievements, rankLabel: rank?.label || (score >= 90 ? "Tốt" : score >= 80 ? "Khá" : score >= 70 ? "Đạt" : "Chưa đạt") };
    });
    rows.sort((a, b) => b.score - a.score || b.totalAdd - a.totalAdd || a.totalDeduct - b.totalDeduct || a.full_name.localeCompare(b.full_name, "vi"));
    let previous: any = null;
    return rows.map((row, index) => {
      const tied = previous && previous.score === row.score && previous.totalAdd === row.totalAdd && previous.totalDeduct === row.totalDeduct;
      const position = tied ? previous.position : index + 1;
      previous = { ...row, position };
      return previous;
    });
  }, [students, periodTransactions, rankConfigs]);

  const visibleRanking = useMemo(() => {
    let rows = ranking.filter((row) => !search || `${row.full_name} ${row.student_code || ""}`.toLowerCase().includes(search.toLowerCase()));
    if (reviewFilter === "pending") rows = rows.filter((row) => row.pending.length > 0);
    if (reviewFilter === "confirmed") rows = rows.filter((row) => row.items.length > 0 && row.pending.length === 0);
    if (reviewFilter === "errors") rows = rows.filter((row) => row.errors.length > 0);
    if (rankFilter !== "all") rows = rows.filter((row) => row.rankLabel === rankFilter);
    return [...rows].sort((a, b) => sortBy === "score_asc" ? a.score - b.score : sortBy === "name" ? a.full_name.localeCompare(b.full_name, "vi") : a.position - b.position);
  }, [ranking, search, reviewFilter, rankFilter, sortBy]);

  const detail = ranking.find((row) => row.id === detailStudentId);
  const detailLessonGroups = useMemo(() => {
    const groups = new Map<string, { lesson: any; items: any[] }>();
    (detail?.items || []).forEach((tx: any) => {
      const lessonId = tx.student_events?.lesson_id;
      if (!lessonId) return;
      const current = groups.get(lessonId) || { lesson: tx.student_events?.lesson_book_entries, items: [] };
      current.items.push(tx);
      groups.set(lessonId, current);
    });
    return Array.from(groups.entries()).map(([lessonId, value]) => ({ lessonId, ...value }));
  }, [detail]);

  function openDetail(row: any) {
    setDetailStudentId(row.id);
    setSelectedTxIds(new Set());
    const drafts: Record<string, string[]> = {};
    row.items.forEach((tx: any) => {
      const lessonId = tx.student_events?.lesson_id;
      const criteriaId = tx.student_events?.criteria_id;
      if (lessonId && criteriaId) drafts[lessonId] = Array.from(new Set([...(drafts[lessonId] || []), criteriaId]));
    });
    setCriteriaDrafts(drafts);
  }

  function toggleTransaction(transactionId: string) {
    setSelectedTxIds((previous) => {
      const next = new Set(previous);
      if (next.has(transactionId)) next.delete(transactionId); else next.add(transactionId);
      return next;
    });
  }

  function toggleAllPending() {
    if (!detail) return;
    const pendingIds = detail.pending.map((tx: any) => tx.id);
    const allSelected = pendingIds.length > 0 && pendingIds.every((id: string) => selectedTxIds.has(id));
    setSelectedTxIds(new Set(allSelected ? [] : pendingIds));
  }

  async function approve(transactionId: string) {
    try {
      await callApi("/api/score/approve", { transaction_id: transactionId, class_id: classId });
      toast.show("Đã xác nhận đánh giá.", "success"); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  async function approveAll() {
    if (!detail?.pending.length) return;
    setProcessing(true);
    try {
      for (const tx of detail.pending) await callApi("/api/score/approve", { transaction_id: tx.id, class_id: classId });
      toast.show(`Đã xác nhận ${detail.pending.length} đánh giá của ${detail.full_name}.`, "success"); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setProcessing(false); }
  }

  async function approveSelected() {
    if (!selectedTxIds.size) return;
    setProcessing(true);
    try {
      for (const transactionId of Array.from(selectedTxIds)) await callApi("/api/score/approve", { transaction_id: transactionId, class_id: classId });
      toast.show(`Đã xác nhận ${selectedTxIds.size} đánh giá đã chọn.`, "success");
      setSelectedTxIds(new Set()); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); await load(); }
    finally { setProcessing(false); }
  }

  function toggleCriteriaDraft(lessonId: string, criteriaId: string) {
    setCriteriaDrafts((previous) => {
      const current = previous[lessonId] || [];
      const next = current.includes(criteriaId) ? current.filter((id) => id !== criteriaId) : [...current, criteriaId];
      return { ...previous, [lessonId]: next };
    });
  }

  async function saveCriteriaDraft(lessonId: string) {
    if (!detail) return;
    setProcessing(true);
    try {
      await callApi("/api/lesson-book/criteria/revise", { class_id: classId, lesson_id: lessonId, student_id: detail.id, criteria_ids: criteriaDrafts[lessonId] || [] });
      toast.show("Đã cập nhật và xác nhận bộ tiêu chí.", "success"); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setProcessing(false); }
  }

  async function adjust(points: string, reason: string) {
    if (!adjustTarget || !reason.trim()) return;
    try {
      await callApi("/api/score/adjust", { transaction_id: adjustTarget.id, class_id: classId, adjusted_points: Number(points), reason });
      toast.show("Đã sửa và xác nhận điểm.", "success"); setAdjustTarget(null); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
  }

  function criteriaSummary(items: any[]) {
    const counts = new Map<string, number>();
    items.forEach((tx) => counts.set(tx.criteria_name_snapshot || "Khác", (counts.get(tx.criteria_name_snapshot || "Khác") || 0) + 1));
    return Array.from(counts.entries()).map(([name, count]) => `${name}${count > 1 ? ` ×${count}` : ""}`).join(", ") || "—";
  }

  const periodLabel = periodType === "week" ? `Tuần ${selectedWeek?.week_number || "—"}` : periodType === "month" ? monthOptions.find((item) => item.value === monthKey)?.label || "Tháng" : periodType === "term" ? "Học kỳ đang chọn" : "Cả năm học";
  const detailCanManage = periodType === "week" && selectedWeek?.status !== "locked";

  return <Section title="Thành tích thi đua trong lớp" description="Mỗi phạm vi bắt đầu một lần với 100 điểm. Xếp hạng chính thức chỉ tính điểm đã duyệt; điểm chờ được hiển thị riêng dưới dạng tạm tính.">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-sm text-ink-muted">Phạm vi: <span className="font-medium text-ink">{periodLabel}</span></div><span className={periodIsOfficial ? "badge-add" : "badge-gold"}>{periodIsOfficial ? "Chính thức" : "Tạm tính"}</span></div>
    <div className="mb-5 grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div><label className="field-label">Xếp hạng theo</label><select className="field-input" value={periodType} onChange={(e) => { setPeriodType(e.target.value as typeof periodType); setDetailStudentId(null); }}><option value="week">Tuần</option><option value="month">Tháng</option><option value="term">Học kỳ</option><option value="year">Năm học</option></select></div>
      {periodType === "week" && <div><label className="field-label">Tuần thi đua</label><select className="field-input" value={weekId} onChange={(e) => setWeekId(e.target.value)}>{termWeeks.map((item) => <option key={item.id} value={item.id}>Tuần {item.week_number} · {item.status === "locked" ? "Đã khóa" : "Đang mở"}</option>)}</select></div>}
      {periodType === "month" && <div><label className="field-label">Tháng</label><select className="field-input" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>{monthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}
      <div><label className="field-label">Tìm học sinh</label><input className="field-input" placeholder="Tên hoặc mã học sinh" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div><label className="field-label">Trạng thái</label><select className="field-input" value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}><option value="all">Tất cả</option><option value="pending">Chờ GVCN xác nhận</option><option value="confirmed">Đã xác nhận</option><option value="errors">Có lỗi vi phạm</option></select></div>
      <div><label className="field-label">Xếp loại</label><select className="field-input" value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}><option value="all">Tất cả</option>{["Tốt", "Khá", "Đạt", "Chưa đạt"].map((label) => <option key={label}>{label}</option>)}</select></div>
      <div><label className="field-label">Sắp xếp</label><select className="field-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="score_desc">Điểm cao → thấp</option><option value="score_asc">Điểm thấp → cao</option><option value="name">Tên học sinh</option></select></div>
    </div>

    {visibleRanking.length === 0 ? <EmptyState message="Không có học sinh phù hợp bộ lọc." /> : <table className="data-table"><thead><tr><th>Hạng</th><th>Học sinh</th><th>Lỗi/vi phạm</th><th>Thành tích</th><th>Điểm gốc</th><th>Điểm cộng</th><th>Điểm trừ</th><th>Điểm chính thức</th><th>Tạm tính</th><th>Xếp loại</th><th>Xác nhận</th><th></th></tr></thead><tbody>{visibleRanking.map((row) => <tr key={row.id}><td><span className={row.position <= 3 ? "badge-gold" : "badge-neutral"}>#{row.position}</span></td><td className="font-medium">{row.full_name}<div className="text-xs font-normal text-ink-muted">{row.student_code}</div></td><td className="max-w-64 text-sm text-ink-muted">{criteriaSummary(row.errors)}</td><td className="max-w-64 text-sm text-ink-muted">{criteriaSummary(row.achievements)}</td><td className="font-medium">100</td><td><span className="badge-add">+{row.totalAdd}</span></td><td><span className="badge-deduct">−{row.totalDeduct}</span></td><td className="font-semibold">{row.score}</td><td>{row.pending.length ? <span className="badge-gold">{row.projectedScore}</span> : "—"}</td><td>{row.rankLabel}</td><td>{row.pending.length ? <span className="badge-gold">Chờ {row.pending.length}</span> : row.officialItems.length ? <span className="badge-add">Đã xác nhận</span> : <span className="badge-neutral">Chưa có</span>}</td><td><button type="button" className="btn-ghost" onClick={() => openDetail(row)}>Chi tiết</button></td></tr>)}</tbody></table>}

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-3" onClick={() => setDetailStudentId(null)}><div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-xl">{detail.full_name}</h3><p className="text-sm text-ink-muted">Hạng #{detail.position} · Điểm chính thức {detail.score}{detail.pending.length ? ` · Tạm tính ${detail.projectedScore}` : ""} · {detail.rankLabel}</p></div>{detail.pending.length > 0 && detailCanManage && <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={toggleAllPending}>{detail.pending.every((tx: any) => selectedTxIds.has(tx.id)) ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button><button type="button" className="btn-secondary" disabled={!selectedTxIds.size || processing} onClick={approveSelected}>Duyệt đã chọn ({selectedTxIds.size})</button><button type="button" className="btn-primary" disabled={processing} onClick={approveAll}>{processing ? "Đang duyệt..." : `Duyệt tất cả (${detail.pending.length})`}</button></div>}</div>
      {detail.items.length === 0 ? <EmptyState message="Học sinh chưa có đánh giá trong phạm vi này." /> : <table className="data-table mt-5"><thead><tr><th>{periodType === "week" && <input type="checkbox" aria-label="Chọn tất cả đánh giá chờ duyệt" checked={detail.pending.length > 0 && detail.pending.every((tx: any) => selectedTxIds.has(tx.id))} onChange={toggleAllPending} disabled={!detail.pending.length || !detailCanManage} />}</th><th>Tiêu chí</th><th>Điểm hệ thống</th><th>Điểm xác nhận</th><th>Trạng thái</th><th>Thời gian</th><th></th></tr></thead><tbody>{detail.items.map((tx: any) => { const effective = Number(tx.adjusted_points ?? tx.system_points); const pending = pendingStatuses.includes(tx.status); return <tr key={tx.id}><td>{periodType === "week" && <input type="checkbox" aria-label={`Chọn ${tx.criteria_name_snapshot}`} checked={selectedTxIds.has(tx.id)} disabled={!pending || !detailCanManage} onChange={() => toggleTransaction(tx.id)} />}</td><td>{tx.criteria_code_snapshot} · {tx.criteria_name_snapshot}</td><td>{Number(tx.system_points) >= 0 ? "+" : ""}{tx.system_points}</td><td><span className={effective >= 0 ? "badge-add" : "badge-deduct"}>{effective >= 0 ? "+" : ""}{effective}</span></td><td>{pending ? <span className="badge-gold">Chờ xác nhận</span> : <span className="badge-add">Đã xác nhận</span>}</td><td>{new Date(tx.created_at).toLocaleString("vi-VN")}</td><td className="whitespace-nowrap">{detailCanManage && <>{pending && <button type="button" className="btn-secondary" onClick={() => approve(tx.id)}>Duyệt</button>}{" "}<button type="button" className="btn-ghost" onClick={() => setAdjustTarget({ id: tx.id, points: effective })}>Sửa điểm</button></>}</td></tr>; })}</tbody></table>}

      {detailCanManage && detailLessonGroups.length > 0 && <div className="mt-6 border-t border-line pt-5"><h4 className="font-medium text-ink">Sửa tiêu chí theo tiết học</h4><p className="mt-1 text-sm text-ink-muted">Tick để thêm, bỏ tick để xóa. Khi lưu, các tiêu chí còn lại được GVCN xác nhận ngay.</p><div className="mt-4 space-y-4">{detailLessonGroups.map((group) => <div key={group.lessonId} className="rounded-lg border border-line bg-paper p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{group.lesson?.lesson_date || "Tiết học"} · Tiết {group.lesson?.period || "—"} · {group.lesson?.subjects?.name || "Môn học"}</div><button type="button" className="btn-primary" disabled={processing} onClick={() => saveCriteriaDraft(group.lessonId)}>Lưu & xác nhận tiêu chí</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{weekCriteriaOptions.map((criteria) => { const checked = (criteriaDrafts[group.lessonId] || []).includes(criteria.id); const point = Number(criteria.points) === 0 ? "0" : `${criteria.kind === "ADD" ? "+" : "−"}${criteria.points}`; return <label key={criteria.id} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${checked ? "border-navy/30 bg-white" : "border-line bg-white/40"}`}><input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleCriteriaDraft(group.lessonId, criteria.id)} /><span><span className="block font-medium">{criteria.code} · {criteria.name}</span><span className="text-xs text-ink-muted">{criteria.category || "—"} · {point} điểm</span></span></label>; })}</div></div>)}</div></div>}
      <div className="mt-5 flex justify-end"><button type="button" className="btn-secondary" onClick={() => setDetailStudentId(null)}>Đóng</button></div></div></div>}

    {adjustTarget && <ConfirmModal title="Sửa và xác nhận điểm thi đua" description="Điểm hệ thống vẫn được lưu trong lịch sử. Hãy nhập điểm xác nhận và lý do điều chỉnh." fields={[{ key: "points", label: "Điểm xác nhận", type: "number", defaultValue: adjustTarget.points, required: true }, { key: "reason", label: "Lý do điều chỉnh", required: true }]} confirmLabel="Lưu và xác nhận" onCancel={() => setAdjustTarget(null)} onConfirm={(values) => adjust(values.points, values.reason)} />}
  </Section>;
}

type ToastApi = { show: (m: string, kind?: "success" | "error" | "info") => void };

const OFFICER_POSITION_LABELS: Record<string, string> = {
  class_monitor: "Lớp trưởng",
  vice_monitor_academic: "Lớp phó học tập",
  vice_monitor_labor: "Lớp phó lao động",
  vice_monitor_activity: "Lớp phó văn thể",
  secretary: "Bí thư",
  group_leader: "Tổ trưởng",
};

const OFFICER_PERMISSION_GROUPS = [
  { label: "Quyền xem", items: [
    { key: "view_class_overview", label: "Xem tổng quan lớp" },
    { key: "view_competition_ranking", label: "Xem xếp hạng toàn lớp" },
    { key: "view_group_ranking", label: "Xem xếp hạng trong tổ" },
  ] },
  { label: "Quyền ghi nhận", items: [
    { key: "record_violation", label: "Ghi nhận vi phạm" },
    { key: "record_achievement", label: "Ghi nhận tuyên dương" },
    { key: "record_academic", label: "Ghi nhận tiêu chí học tập" },
  ] },
  { label: "Kiểm tra và báo cáo", items: [
    { key: "review_officer_records", label: "Xác nhận ghi nhận của cán sự" },
    { key: "approve_scores", label: "Duyệt điểm thay GVCN (chỉ lớp trưởng)" },
    { key: "create_forum_posts", label: "Đăng thông báo lớp" },
    { key: "publish_forum_without_review", label: "Tự đăng không cần GVCN duyệt" },
    { key: "approve_forum_posts", label: "Duyệt thông báo (chỉ lớp trưởng)" },
    { key: "view_weekly_report", label: "Xem tổng hợp tuần" },
  ] },
];

const DEFAULT_OFFICER_PERMISSIONS: Record<string, string[]> = {
  class_monitor: ["view_class_overview", "view_competition_ranking", "record_violation", "record_achievement", "review_officer_records", "approve_scores", "create_forum_posts", "view_weekly_report"],
  vice_monitor_academic: ["view_class_overview", "view_competition_ranking", "record_academic", "create_forum_posts", "view_weekly_report"],
  group_leader: ["view_group_ranking", "record_violation", "record_achievement", "record_academic", "view_weekly_report"],
};

// =========================================================
// IMPORT HỌC SINH
// =========================================================
function ImportStudents({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [years, setYears] = useState<Option[]>([]);

  useEffect(() => {
    supabase.from("classes").select("school_year_id, school_years(id, name)").eq("id", classId).maybeSingle()
      .then(({ data }: any) => {
        const year = data?.school_years;
        setYears(year ? [year] : []);
        setSchoolYearId(data?.school_year_id || "");
      });
  }, [classId]);

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("class_id", classId);
    form.append("file", file);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/students/import/validate", {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) {
      toast.show(`Lỗi: ${json.detail}`, "error");
      return;
    }
    setPreview(json);
  }

  async function handleConfirm() {
    const validRows = preview.rows.filter((r: any) => r.is_valid);
    const result = await callApi("/api/students/import/confirm", {
      class_id: classId,
      school_year_id: schoolYearId,
      rows: validRows,
    });
    toast.show(`Đã import ${result.created.length} học sinh, lỗi ${result.failed.length}.`, "success");
    setPreview(null);
    setFile(null);
  }

  return (
    <Section title="Import danh sách học sinh" description="Cột bắt buộc: Họ và tên · Giới tính · Ngày tháng năm sinh · Số điện thoại phụ huynh · Email phụ huynh · Địa chỉ">
      <form onSubmit={handleValidate} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Năm học</label>
          <select className="field-input w-44" value={schoolYearId} onChange={(e) => setSchoolYearId(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">File Excel (.xlsx)</label>
          <input type="file" accept=".xlsx" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </div>
        <button type="submit" className="btn-secondary">Kiểm tra file</button>
      </form>

      {preview && (
        <div className="mt-5">
          <p className="text-sm text-ink-muted">
            Tổng {preview.total} dòng — <span className="text-add font-medium">{preview.valid_count} hợp lệ</span>,{" "}
            <span className="text-deduct font-medium">{preview.invalid_count} lỗi</span>
          </p>
          <table className="data-table mt-3 min-w-[900px]">
            <thead>
              <tr>
                <th className="w-14">STT</th>
                <th>Họ tên</th>
                <th>Giới tính</th>
                <th>Ngày sinh</th>
                <th>SĐT phụ huynh</th>
                <th>Email phụ huynh</th>
                <th>Địa chỉ</th>
                <th>Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r: any, index: number) => (
                <tr key={r.row_index} className={r.is_valid ? "" : "bg-deduct-bg/40"}>
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-medium">{r.full_name || "—"}</td>
                  <td>{r.gender === "male" ? "Nam" : r.gender === "female" ? "Nữ" : r.gender === "other" ? "Khác" : "—"}</td>
                  <td>{r.dob || "—"}</td>
                  <td>{r.parent_phone || "—"}</td>
                  <td>{r.parent_email || "—"}</td>
                  <td className="max-w-64 whitespace-normal">{r.address || "—"}</td>
                  <td className="text-deduct text-xs">{r.errors.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary mt-4" onClick={handleConfirm} disabled={!schoolYearId || preview.valid_count === 0}>
            Xác nhận import {preview.valid_count} học sinh hợp lệ
          </button>
        </div>
      )}
    </Section>
  );
}

// =========================================================
// QUẢN LÝ LỚP HỌC
// =========================================================
function ClassManagement({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schoolYearId, setSchoolYearId] = useState("");

  // Form thêm mới
  const [addName, setAddName] = useState("");
  const [addGender, setAddGender] = useState("male");
  const [addDob, setAddDob] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addParentEmail, setAddParentEmail] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addPosition, setAddPosition] = useState("");

  // Form sửa
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editParentEmail, setEditParentEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPosition, setEditPosition] = useState("");

  async function load() {
    const [enrollResult, classResult, officerResult] = await Promise.all([
      supabase
        .from("student_class_enrollments")
        .select("student_id, students(id, student_code, full_name, gender, date_of_birth, parent_phone, parent_email, address)")
        .eq("class_id", classId)
        .is("left_at", null),
      supabase.from("classes").select("school_year_id").eq("id", classId).maybeSingle(),
      supabase
        .from("class_officers")
        .select("id, student_id, position, group_id, groups_(name)")
        .eq("class_id", classId)
        .eq("status", "active"),
    ]);

    const loadError = enrollResult.error || classResult.error || officerResult.error;
    if (loadError) {
      toast.show(`Lỗi khi tải danh sách: ${loadError.message}`, "error");
      return;
    }

    const officersByStudent = new Map<string, any[]>();
    for (const officer of officerResult.data || []) {
      const current = officersByStudent.get(officer.student_id) || [];
      current.push(officer);
      officersByStudent.set(officer.student_id, current);
    }
    const list = (enrollResult.data || []).map((r: any) => ({
      ...r.students,
      officers: officersByStudent.get(r.student_id) || [],
      position: (officersByStudent.get(r.student_id) || []).find((officer) => officer.position !== "group_leader")?.position || null,
    })).filter(Boolean);
    list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    setStudents(list);
    setSchoolYearId(classResult.data?.school_year_id || "");
  }

  useEffect(() => { load(); }, [classId]);

  // --- Thêm học sinh ---
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addDob) {
      toast.show("Họ tên và ngày sinh là bắt buộc.", "error");
      return;
    }
    if (!schoolYearId) {
      toast.show("Không xác định được năm học của lớp.", "error");
      return;
    }
    try {
      const { data: studentData, error: studentErr } = await supabase.from("students").insert({
        full_name: addName.trim(),
        gender: addGender,
        date_of_birth: addDob,
        parent_phone: addPhone.trim() || null,
        parent_email: addParentEmail.trim().toLowerCase() || null,
        address: addAddress.trim() || null,
      }).select().single();

      if (studentErr) throw studentErr;

      const { error: enrollErr } = await supabase.from("student_class_enrollments").insert({
        student_id: studentData.id,
        class_id: classId,
        school_year_id: schoolYearId,
      });

      if (enrollErr) {
        await supabase.from("students").delete().eq("id", studentData.id);
        throw enrollErr;
      }

      if (addPosition) {
        const { error: officerErr } = await supabase.from("class_officers").insert({
          class_id: classId,
          student_id: studentData.id,
          position: addPosition,
        });
        if (officerErr) {
          await supabase.from("students").delete().eq("id", studentData.id);
          throw officerErr;
        }
      }

      toast.show(`Đã thêm học sinh ${addName.trim()}.`, "success");
      setAddName(""); setAddGender("male"); setAddDob(""); setAddPhone(""); setAddParentEmail(""); setAddAddress(""); setAddPosition("");
      setShowAddForm(false);
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  // --- Sửa học sinh ---
  function startEdit(s: any) {
    setEditingId(s.id);
    setEditName(s.full_name || "");
    setEditGender(s.gender || "male");
    setEditDob(s.date_of_birth || "");
    setEditPhone(s.parent_phone || "");
    setEditParentEmail(s.parent_email || "");
    setEditAddress(s.address || "");
    setEditPosition(s.position || "");
  }

  async function handleSave() {
    if (!editName.trim()) {
      toast.show("Họ tên không được để trống.", "error");
      return;
    }
    if (editParentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editParentEmail.trim())) {
      toast.show("Email phụ huynh không hợp lệ.", "error");
      return;
    }
    const { error } = await supabase.from("students").update({
      full_name: editName.trim(),
      gender: editGender,
      date_of_birth: editDob || null,
      parent_phone: editPhone.trim() || null,
      parent_email: editParentEmail.trim().toLowerCase() || null,
      address: editAddress.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingId);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
      return;
    }

    // Chức vụ thuộc class_officers, không thuộc student_class_enrollments.
    const editingStudent = students.find((student) => student.id === editingId);
    const currentOfficer = editingStudent?.officers?.find((officer: any) => officer.position !== "group_leader");
    if (editPosition !== (currentOfficer?.position || "")) {
      let newOfficerId: string | null = null;
      if (editPosition) {
        const { data: newOfficer, error: insertOfficerError } = await supabase.from("class_officers").insert({
          class_id: classId,
          student_id: editingId,
          position: editPosition,
        }).select("id").single();
        if (insertOfficerError) {
          toast.show(`Lỗi cập nhật chức vụ: ${insertOfficerError.message}`, "error");
          return;
        }
        newOfficerId = newOfficer.id;
      }
      if (currentOfficer) {
        const { error: removeOfficerError } = await supabase.from("class_officers").update({
          status: "removed",
          removed_at: new Date().toISOString(),
        }).eq("id", currentOfficer.id);
        if (removeOfficerError) {
          if (newOfficerId) {
            await supabase.from("class_officers").update({
              status: "removed",
              removed_at: new Date().toISOString(),
            }).eq("id", newOfficerId);
          }
          toast.show(`Lỗi cập nhật chức vụ: ${removeOfficerError.message}`, "error");
          return;
        }
      }
    }

    toast.show("Đã cập nhật thông tin học sinh.", "success");
    setEditingId(null);
    load();
  }

  // --- Xóa 1 học sinh khỏi lớp ---
  async function handleDeleteOne(studentId: string) {
    const { error } = await supabase
      .from("student_class_enrollments")
      .update({ left_at: new Date().toISOString(), status: "transferred_out" })
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .is("left_at", null);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } else {
      toast.show("Đã xóa học sinh khỏi lớp.", "success");
    }
    setConfirmDeleteOne(null);
    load();
  }

  // --- Xóa toàn bộ ---
  async function handleDeleteAll() {
    const { error } = await supabase
      .from("student_class_enrollments")
      .update({ left_at: new Date().toISOString(), status: "transferred_out" })
      .eq("class_id", classId)
      .is("left_at", null);

    if (error) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } else {
      toast.show("Đã xóa toàn bộ học sinh khỏi lớp.", "success");
    }
    setConfirmDeleteAll(false);
    load();
  }

  const filtered = students.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Section title={`Quản lý lớp học (${students.length} học sinh)`} description="Danh sách toàn bộ học sinh đang học trong lớp.">
      {/* Thanh công cụ */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          className="field-input w-64"
          placeholder="Tìm kiếm theo tên hoặc mã HS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? "Đóng form" : "+ Thêm học sinh"}
        </button>
        {students.length > 0 && (
          <button className="btn-ghost text-deduct" onClick={() => setConfirmDeleteAll(true)}>
            Xóa toàn bộ danh sách
          </button>
        )}
      </div>

      {/* Form thêm học sinh */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="mb-6 rounded border border-line bg-paper p-4">
          <h4 className="mb-3 font-medium text-ink">Thêm học sinh mới</h4>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="field-label">Họ tên *</label>
              <input className="field-input w-48" value={addName} onChange={(e) => setAddName(e.target.value)} required placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="field-label">Giới tính</label>
              <select className="field-input w-28" value={addGender} onChange={(e) => setAddGender(e.target.value)}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label className="field-label">Ngày sinh *</label>
              <input type="date" className="field-input" value={addDob} onChange={(e) => setAddDob(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">SĐT phụ huynh</label>
              <input className="field-input w-36" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder="0912345678" />
            </div>
            <div>
              <label className="field-label">Email phụ huynh</label>
              <input type="email" className="field-input w-56" value={addParentEmail} onChange={(e) => setAddParentEmail(e.target.value)} placeholder="phuhuynh@example.com" />
            </div>
            <div>
              <label className="field-label">Địa chỉ</label>
              <input className="field-input w-56" value={addAddress} onChange={(e) => setAddAddress(e.target.value)} placeholder="123 Lê Lợi, Q.1" />
            </div>
            <div>
              <label className="field-label">Chức vụ</label>
              <select className="field-input w-32" value={addPosition} onChange={(e) => setAddPosition(e.target.value)}>
                <option value="">Học sinh</option>
                <option value="class_monitor">Lớp trưởng</option>
                <option value="vice_monitor_academic">Lớp phó học tập</option>
                <option value="vice_monitor_labor">Lớp phó lao động</option>
                <option value="vice_monitor_activity">Lớp phó văn thể</option>
                <option value="secretary">Bí thư</option>
              </select>
            </div>
            <button type="submit" className="btn-primary">Thêm</button>
          </div>
        </form>
      )}

      {students.length === 0 ? (
        <EmptyState message="Lớp chưa có học sinh. Vui lòng thêm hoặc import học sinh." />
      ) : filtered.length === 0 ? (
        <EmptyState message="Không tìm thấy học sinh phù hợp." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-14">STT</th>
              <th>Mã HS</th>
              <th>Họ tên</th>
              <th>Giới tính</th>
              <th>Ngày sinh</th>
              <th>SĐT phụ huynh</th>
              <th>Email phụ huynh</th>
              <th>Địa chỉ</th>
              <th>Chức vụ</th>
              <th className="w-32">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, index) => (
              editingId === s.id ? (
                <tr key={s.id} className="bg-gold-bg/30">
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-mono text-xs">{s.student_code}</td>
                  <td><input className="field-input w-40" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                  <td>
                    <select className="field-input w-24" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </td>
                  <td><input type="date" className="field-input" value={editDob} onChange={(e) => setEditDob(e.target.value)} /></td>
                  <td><input className="field-input w-32" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></td>
                  <td><input type="email" className="field-input w-52" value={editParentEmail} onChange={(e) => setEditParentEmail(e.target.value)} /></td>
                  <td><input className="field-input w-40" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></td>
                  <td>
                    <select className="field-input w-28" value={editPosition} onChange={(e) => setEditPosition(e.target.value)}>
                      <option value="">Học sinh</option>
                      <option value="class_monitor">Lớp trưởng</option>
                      <option value="vice_monitor_academic">Lớp phó học tập</option>
                      <option value="vice_monitor_labor">Lớp phó lao động</option>
                      <option value="vice_monitor_activity">Lớp phó văn thể</option>
                      <option value="secretary">Bí thư</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-primary text-xs" onClick={handleSave}>Lưu</button>{" "}
                    <button className="btn-ghost text-xs" onClick={() => setEditingId(null)}>Hủy</button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-mono text-xs">{s.student_code}</td>
                  <td className="font-medium">{s.full_name}</td>
                  <td>{s.gender === "male" ? "Nam" : s.gender === "female" ? "Nữ" : s.gender === "other" ? "Khác" : "—"}</td>
                  <td>{s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString("vi-VN") : "—"}</td>
                  <td>{s.parent_phone || "—"}</td>
                  <td>{s.parent_email || "—"}</td>
                  <td className="max-w-48 truncate" title={s.address}>{s.address || "—"}</td>
                  <td>
                    {s.officers?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.officers.map((officer: any) => (
                          <span key={officer.id} className="badge-neutral">
                            {OFFICER_POSITION_LABELS[officer.position] || officer.position}
                            {officer.groups_?.name ? ` · ${officer.groups_.name}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : "Học sinh"}
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-ghost text-xs" onClick={() => startEdit(s)}>Sửa</button>{" "}
                    <button className="btn-ghost text-xs text-deduct" onClick={() => setConfirmDeleteOne(s.id)}>Xóa</button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}

      {/* Modal xác nhận xóa toàn bộ */}
      {confirmDeleteAll && (
        <ConfirmModal
          title="Xóa toàn bộ học sinh khỏi lớp"
          description={`Bạn sắp xóa ${students.length} học sinh khỏi lớp. Học sinh sẽ được đánh dấu đã rời lớp (không xóa vĩnh viễn dữ liệu). Hành động này không thể hoàn tác dễ dàng.`}
          confirmLabel="Xóa toàn bộ"
          danger={true}
          onCancel={() => setConfirmDeleteAll(false)}
          onConfirm={() => handleDeleteAll()}
        />
      )}

      {/* Modal xác nhận xóa 1 học sinh */}
      {confirmDeleteOne && (
        <ConfirmModal
          title="Xóa học sinh khỏi lớp"
          description={`Bạn sắp xóa học sinh "${students.find(s => s.id === confirmDeleteOne)?.full_name || ""}" khỏi lớp. Học sinh sẽ được đánh dấu đã rời lớp.`}
          confirmLabel="Xóa"
          danger={true}
          onCancel={() => setConfirmDeleteOne(null)}
          onConfirm={() => handleDeleteOne(confirmDeleteOne)}
        />
      )}
    </Section>
  );
}

// =========================================================
// TẠO TÀI KHOẢN HỌC SINH / PHỤ HUYNH
// =========================================================
function StudentAccounts({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentPasswordConfirm, setStudentPasswordConfirm] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [parentPasswordConfirm, setParentPasswordConfirm] = useState("");
  const [relationship, setRelationship] = useState("father");
  const [result, setResult] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [editingStudentAccount, setEditingStudentAccount] = useState(false);
  const [editStudentEmail, setEditStudentEmail] = useState("");
  const [editStudentPassword, setEditStudentPassword] = useState("");
  const [editStudentPasswordConfirm, setEditStudentPasswordConfirm] = useState("");
  const [confirmDeleteStudentAccount, setConfirmDeleteStudentAccount] = useState(false);

  async function loadStudents() {
    const { data } = await supabase
      .from("student_class_enrollments")
      .select("students(id, full_name)")
      .eq("class_id", classId)
      .is("left_at", null);
    setStudents((data || []).map((r: any) => r.students).filter(Boolean));
  }

  async function loadStudentAccounts() {
    setAccountsLoading(true);
    try {
      setStudentAccounts(await callApiGet(`/api/homeroom/students/accounts?class_id=${encodeURIComponent(classId)}`));
    } catch (err: any) {
      toast.show(`Không thể tải tài khoản học sinh: ${err.message}`, "error");
    } finally {
      setAccountsLoading(false);
    }
  }

  useEffect(() => {
    setStudentId("");
    setEditingStudentAccount(false);
    loadStudents();
    loadStudentAccounts();
  }, [classId]);

  const selectedStudentAccount = studentAccounts.find((item) => item.student_id === studentId)?.account || null;

  function selectStudent(value: string) {
    setStudentId(value);
    setEditingStudentAccount(false);
    setResult("");
    setStudentEmail("");
    setStudentPassword("");
    setStudentPasswordConfirm("");
  }

  function startEditStudentAccount() {
    setEditStudentEmail(selectedStudentAccount?.email || "");
    setEditStudentPassword("");
    setEditStudentPasswordConfirm("");
    setEditingStudentAccount(true);
  }

  async function previewBulkAccounts() {
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const data = await callApi("/api/homeroom/students/accounts/bulk/preview", { class_id: classId });
      setBulkPreview(data);
      setBulkSelected(new Set(data.rows.filter((row: any) => row.is_valid).map((row: any) => row.row_index)));
    } catch (err: any) {
      setBulkPreview(null);
      setBulkSelected(new Set());
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function toggleBulkPanel() {
    if (bulkOpen) {
      setBulkOpen(false);
      return;
    }
    setBulkOpen(true);
    await previewBulkAccounts();
  }

  function toggleBulkRow(rowIndex: number) {
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex); else next.add(rowIndex);
      return next;
    });
  }

  function toggleAllValidRows() {
    const validRows = (bulkPreview?.rows || []).filter((row: any) => row.is_valid);
    const allSelected = validRows.length > 0 && validRows.every((row: any) => bulkSelected.has(row.row_index));
    setBulkSelected(allSelected ? new Set() : new Set(validRows.map((row: any) => row.row_index)));
  }

  async function confirmBulkAccounts() {
    const rows = (bulkPreview?.rows || []).filter(
      (row: any) => row.is_valid && bulkSelected.has(row.row_index)
    );
    if (!rows.length) {
      toast.show("Chưa chọn học sinh hợp lệ nào.", "error");
      return;
    }
    setBulkLoading(true);
    try {
      const data = await callApi("/api/homeroom/students/accounts/bulk/confirm", {
        class_id: classId,
        rows: rows.map((row: any) => ({
          row_index: row.row_index,
          student_id: row.student_id,
          full_name: row.full_name,
        })),
      });
      setBulkResult(data);
      setBulkSelected(new Set());
      await loadStudents();
      await loadStudentAccounts();
      toast.show(`Đã tạo ${data.created_count} tài khoản học sinh.`, data.failed_count ? "error" : "success");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function exportStudentAccounts() {
    setBulkLoading(true);
    try {
      const data = await callApi("/api/homeroom/students/accounts/export", { class_id: classId });
      if (!data.download_base64) return;
      const binary = window.atob(data.download_base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.download_filename || "danh-sach-tai-khoan-hoc-sinh.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  function downloadBulkResult() {
    if (!bulkResult?.download_base64) return;
    const binary = window.atob(bulkResult.download_base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = bulkResult.download_filename || "tai-khoan-hoc-sinh.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    if (studentPassword.length < 8 || studentPassword !== studentPasswordConfirm) {
      toast.show(studentPassword.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const res = await callApi("/api/homeroom/students/create-login", {
        student_id: studentId, class_id: classId, email: studentEmail, password: studentPassword,
      });
      setResult(`Tài khoản học sinh: ${res.email} — Mật khẩu ban đầu: ${res.temporary_password}`);
      toast.show("Đã tạo tài khoản học sinh.", "success");
      setStudentEmail("");
      setStudentPassword("");
      setStudentPasswordConfirm("");
      await loadStudentAccounts();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function updateStudentAccount(e: React.FormEvent) {
    e.preventDefault();
    if (editStudentPassword && (editStudentPassword.length < 8 || editStudentPassword !== editStudentPasswordConfirm)) {
      toast.show(editStudentPassword.length < 8 ? "Mật khẩu mới phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const updated = await callApi("/api/homeroom/students/update-login", {
        student_id: studentId,
        class_id: classId,
        email: editStudentEmail,
        password: editStudentPassword || null,
      });
      setEditingStudentAccount(false);
      setResult(`Đã cập nhật tài khoản học sinh: ${updated.email}${editStudentPassword ? " — Học sinh phải đổi mật khẩu khi đăng nhập." : ""}`);
      await loadStudentAccounts();
      toast.show("Đã cập nhật tài khoản học sinh.", "success");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function deleteStudentAccount() {
    try {
      await callApi("/api/homeroom/students/delete-login", { student_id: studentId, class_id: classId });
      setConfirmDeleteStudentAccount(false);
      setEditingStudentAccount(false);
      setResult("Đã xóa tài khoản đăng nhập của học sinh. Hồ sơ học sinh vẫn được giữ nguyên trong lớp.");
      await loadStudentAccounts();
      toast.show("Đã xóa tài khoản học sinh.", "success");
    } catch (err: any) {
      setConfirmDeleteStudentAccount(false);
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function createParentLogin(e: React.FormEvent) {
    e.preventDefault();
    if (parentPassword.length < 8 || parentPassword !== parentPasswordConfirm) {
      toast.show(parentPassword.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const res = await callApi("/api/homeroom/parents/create-login", {
        student_id: studentId, class_id: classId, email: parentEmail, full_name: parentName, relationship,
        password: parentPassword,
      });
      setResult(`Tài khoản phụ huynh: ${res.email} — Mật khẩu ban đầu: ${res.temporary_password}`);
      toast.show("Đã tạo tài khoản phụ huynh.", "success");
      setParentEmail("");
      setParentName("");
      setParentPassword("");
      setParentPasswordConfirm("");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title="Tài khoản đăng nhập cho học sinh / phụ huynh" description="Học sinh không tự đăng ký — GVCN tạo hộ tài khoản.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-paper-muted p-4">
        <div>
          <p className="font-medium text-ink">Quản lý tài khoản học sinh</p>
          <p className="mt-1 text-sm text-ink-muted">Tạo mới hoặc xuất danh sách tài khoản học sinh trong lớp.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportStudentAccounts}
            disabled={bulkLoading}
          >
            Xuất file Excel danh sách
          </button>
          <button type="button" className="btn-primary" onClick={toggleBulkPanel} disabled={bulkLoading}>
            {bulkOpen ? "Đóng tạo hàng loạt" : "Tạo tài khoản hàng loạt"}
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="mb-6 rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Danh sách học sinh hiện tại của lớp</p>
              <p className="mt-1 text-xs text-ink-muted">Học sinh đã có tài khoản sẽ được đánh dấu và không thể chọn lại.</p>
            </div>
            <button type="button" className="btn-secondary" disabled={bulkLoading} onClick={previewBulkAccounts}>
              {bulkLoading ? "Đang tải..." : "Làm mới danh sách"}
            </button>
          </div>

          {bulkLoading && !bulkPreview && <p className="mt-5 text-sm text-ink-muted">Đang lấy danh sách học sinh...</p>}

          {bulkPreview && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink-muted">
                  Tổng {bulkPreview.total} dòng · <span className="text-add">{bulkPreview.valid_count} hợp lệ</span> · <span className="text-deduct">{bulkPreview.invalid_count} lỗi</span>
                </p>
                <button type="button" className="btn-ghost text-sm" onClick={toggleAllValidRows}>
                  Chọn tất cả / Bỏ chọn
                </button>
              </div>
              {bulkPreview.total === 0 ? <EmptyState message="Lớp chưa có học sinh. Hãy import học sinh trước khi tạo tài khoản." /> : <div className="overflow-x-auto rounded border border-border">
                <table className="data-table min-w-[900px]">
                  <thead><tr><th className="w-14">Chọn</th><th>STT</th><th>Mã HS</th><th>Họ và tên</th><th>Tên đăng nhập</th><th>Mật khẩu mặc định</th><th>Kiểm tra</th></tr></thead>
                  <tbody>
                    {bulkPreview.rows.map((row: any) => (
                      <tr key={row.row_index} className={row.is_valid ? "" : "bg-deduct-bg/40"}>
                        <td><input type="checkbox" checked={bulkSelected.has(row.row_index)} disabled={!row.is_valid || bulkLoading} onChange={() => toggleBulkRow(row.row_index)} aria-label={`Chọn dòng ${row.row_index}`} /></td>
                        <td className="text-ink-muted">{row.row_index}</td>
                        <td className="font-mono text-xs">{row.student_code || "—"}</td>
                        <td className="font-medium">{row.full_name || "—"}</td>
                        <td>{row.email || "—"}</td>
                        <td className="font-mono text-xs">{row.password || "—"}</td>
                        <td>{row.is_valid ? <span className="badge-add">Hợp lệ</span> : <span className="text-sm text-deduct">{row.errors.join("; ")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
              {bulkPreview.total > 0 && <div className="mt-4 flex justify-end">
                <button type="button" className="btn-primary" disabled={bulkLoading || bulkSelected.size === 0} onClick={confirmBulkAccounts}>
                  {bulkLoading ? "Đang tạo..." : `Tạo ${bulkSelected.size} tài khoản đã chọn`}
                </button>
              </div>}
            </div>
          )}

          {bulkResult && (
            <div className="mt-5 rounded-lg border border-gold/30 bg-gold-bg p-4">
              <p className="font-medium">Kết quả: {bulkResult.created_count} thành công, {bulkResult.failed_count} thất bại.</p>
              {bulkResult.failed?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-deduct">
                  {bulkResult.failed.map((item: any, index: number) => <li key={`${item.student_id}-${index}`}>{item.full_name || "Không xác định"}: {item.reason}</li>)}
                </ul>
              )}
              <button type="button" className="btn-secondary mt-3" onClick={downloadBulkResult}>Tải file Excel tài khoản</button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="field-label">Chọn học sinh</label>
        <select className="field-input w-64" value={studentId} onChange={(e) => selectStudent(e.target.value)}>
          <option value="">-- Chọn --</option>
          {students.map((s) => {
            const hasAccount = Boolean(studentAccounts.find((item) => item.student_id === s.id)?.account);
            return <option key={s.id} value={s.id}>{s.full_name}{hasAccount ? " — Đã có tài khoản" : ""}</option>;
          })}
        </select>
      </div>

      {studentId && (
        <div className="mt-4 space-y-5">
          <div className="rounded-lg border border-border bg-paper-muted p-4">
            <h3 className="font-medium text-ink">Tài khoản học sinh</h3>
            {accountsLoading ? (
              <p className="mt-3 text-sm text-ink-muted">Đang kiểm tra tài khoản...</p>
            ) : selectedStudentAccount ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-add/30 bg-add-bg p-3">
                  <div>
                    <p className="font-medium text-add">Học sinh đã có tài khoản</p>
                    <p className="mt-1 text-sm text-ink"><span className="text-ink-muted">Tên đăng nhập:</span> {selectedStudentAccount.email}</p>
                    {selectedStudentAccount.created_at && <p className="mt-1 text-xs text-ink-muted">Ngày tạo: {new Date(selectedStudentAccount.created_at).toLocaleString("vi-VN")}</p>}
                    <p className="mt-1 text-xs text-ink-muted">Mật khẩu hiện tại được mã hóa nên không thể xem lại. Có thể đặt mật khẩu mới bằng nút Sửa.</p>
                    <p className="mt-1 text-xs text-ink-muted">Đăng nhập gần nhất: {selectedStudentAccount.last_sign_in_at ? new Date(selectedStudentAccount.last_sign_in_at).toLocaleString("vi-VN") : "Chưa từng đăng nhập"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" onClick={startEditStudentAccount}>Sửa</button>
                    <button type="button" className="btn-danger" onClick={() => setConfirmDeleteStudentAccount(true)}>Xóa</button>
                  </div>
                </div>

                {editingStudentAccount && (
                  <form onSubmit={updateStudentAccount} className="mt-4 flex flex-wrap items-end gap-2 rounded border border-border bg-white p-3">
                    <div>
                      <label className="field-label">Email học sinh</label>
                      <input type="email" className="field-input w-56" value={editStudentEmail} onChange={(e) => setEditStudentEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="field-label">Mật khẩu mới (không bắt buộc)</label>
                      <input type="password" className="field-input w-52" value={editStudentPassword} onChange={(e) => setEditStudentPassword(e.target.value)} minLength={8} autoComplete="new-password" />
                    </div>
                    <div>
                      <label className="field-label">Nhập lại mật khẩu mới</label>
                      <input type="password" className="field-input w-52" value={editStudentPasswordConfirm} onChange={(e) => setEditStudentPasswordConfirm(e.target.value)} minLength={8} autoComplete="new-password" />
                    </div>
                    <button type="submit" className="btn-primary">Lưu thay đổi</button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingStudentAccount(false)}>Hủy</button>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={createStudentLogin} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="field-label">Email học sinh</label>
              <input type="email" className="field-input w-52" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Mật khẩu</label>
              <input type="password" className="field-input w-44" value={studentPassword} onChange={(e) => setStudentPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Nhập lại mật khẩu</label>
              <input type="password" className="field-input w-44" value={studentPasswordConfirm} onChange={(e) => setStudentPasswordConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <button type="submit" className="btn-secondary">Tạo tài khoản</button>
              </form>
            )}
          </div>

          <form onSubmit={createParentLogin} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-4">
            <h3 className="w-full font-medium text-ink">Tài khoản phụ huynh</h3>
            <div>
              <label className="field-label">Email phụ huynh</label>
              <input type="email" className="field-input w-52" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Họ tên phụ huynh</label>
              <input className="field-input w-44" value={parentName} onChange={(e) => setParentName(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Mật khẩu</label>
              <input type="password" className="field-input w-44" value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Nhập lại mật khẩu</label>
              <input type="password" className="field-input w-44" value={parentPasswordConfirm} onChange={(e) => setParentPasswordConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Quan hệ</label>
              <select className="field-input w-36" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="father">Bố</option>
                <option value="mother">Mẹ</option>
                <option value="guardian">Người giám hộ</option>
              </select>
            </div>
            <button type="submit" className="btn-secondary">Tạo tài khoản</button>
          </form>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-gold/30 bg-gold-bg px-4 py-3 text-sm">{result}</div>
      )}

      {confirmDeleteStudentAccount && (
        <ConfirmModal
          title="Xóa tài khoản học sinh"
          description={`Xóa tài khoản đăng nhập ${selectedStudentAccount?.email || ""}? Hồ sơ và dữ liệu học sinh trong lớp vẫn được giữ lại.`}
          confirmLabel="Xóa tài khoản"
          danger={true}
          onCancel={() => setConfirmDeleteStudentAccount(false)}
          onConfirm={deleteStudentAccount}
        />
      )}
    </Section>
  );
}

// =========================================================
// TIÊU CHÍ THI ĐUA
// =========================================================
function Criteria({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [list, setList] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("");
  const [kind, setKind] = useState("ADD");
  const [points, setPoints] = useState(2);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase.from("criteria").select("*").eq("class_id", classId).eq("status", "active").order("code");
    setList(data || []);
  }
  useEffect(() => { load(); }, [classId]);

  function resetForm() {
    setCode("");
    setCategory("");
    setName("");
    setSeverity("");
    setKind("ADD");
    setPoints(2);
    setEditingId(null);
  }

  function startEdit(criteria: any) {
    setEditingId(criteria.id);
    setCode(criteria.code);
    setCategory(criteria.category || "");
    setName(criteria.name);
    setSeverity(criteria.severity || "");
    setKind(criteria.kind);
    setPoints(Number(criteria.points));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const values = { code: code.trim(), category: category.trim(), name: name.trim(), severity: severity.trim() || null, kind, points };
    const { error } = editingId
      ? await supabase.from("criteria").update({ ...values, updated_at: new Date().toISOString() }).eq("id", editingId).eq("class_id", classId)
      : await supabase.from("criteria").insert({ class_id: classId, ...values });
    toast.show(error ? `Lỗi: ${error.message}` : editingId ? "Đã cập nhật tiêu chí." : "Đã thêm tiêu chí.", error ? "error" : "success");
    if (!error) resetForm();
    load();
  }

  async function removeCriteria() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("criteria").update({ status: "inactive", effective_to: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq("id", deleteTarget.id).eq("class_id", classId);
    if (!error) {
      await supabase.from("event_criteria_mappings").update({ status: "inactive" }).eq("class_id", classId).eq("criteria_id", deleteTarget.id);
      if (editingId === deleteTarget.id) resetForm();
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã xóa tiêu chí.", error ? "error" : "success");
    setDeleteTarget(null);
    load();
  }

  return (
    <Section title="Tiêu chí thi đua" description="Thiết lập các quy tắc cộng, trừ hoặc theo dõi điểm cho lớp.">
      <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
        <div>
          <label className="field-label">Mã</label>
          <input className="field-input w-24" placeholder="TC01" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Nhóm</label>
          <input className="field-input w-32" placeholder="Nề nếp" value={category} onChange={(e) => setCategory(e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Tên tiêu chí</label>
          <input className="field-input w-56" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Mức độ</label>
          <input className="field-input w-28" placeholder="Nhẹ" value={severity} onChange={(e) => setSeverity(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Loại</label>
          <select className="field-input w-36" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="ADD">Cộng điểm</option>
            <option value="DEDUCT">Trừ điểm</option>
          </select>
        </div>
        <div>
          <label className="field-label">Điểm</label>
          <input type="number" min={0} step={0.5} className="field-input w-24" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </div>
        <button type="submit" className="btn-primary">{editingId ? "Lưu thay đổi" : "Thêm tiêu chí"}</button>
        {editingId && <button type="button" className="btn-ghost" onClick={resetForm}>Hủy sửa</button>}
      </form>

      {list.length === 0 ? (
        <EmptyState message="Chưa có tiêu chí nào." />
      ) : (
        <table className="data-table mt-5">
          <thead><tr><th>Mã</th><th>Nhóm</th><th>Tiêu chí</th><th>Mức độ</th><th>Điểm</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs text-ink-muted">{c.code}</td>
                <td>{c.category || "—"}</td>
                <td>{c.name}</td>
                <td className="text-ink-muted">{c.severity || "—"}</td>
                <td>
                  <span className={Number(c.points) === 0 ? "badge-neutral" : c.kind === "ADD" ? "badge-add" : "badge-deduct"}>
                    {Number(c.points) === 0 ? "0" : `${c.kind === "ADD" ? "+" : "−"}${c.points}`}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn-ghost" onClick={() => startEdit(c)}>Sửa</button>{" "}
                  <button type="button" className="btn-ghost text-red-700" onClick={() => setDeleteTarget(c)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Xóa tiêu chí"
          description={`Tiêu chí “${deleteTarget.name}” sẽ ngừng được sử dụng cho các sự kiện mới. Điểm đã ghi trước đây không thay đổi.`}
          confirmLabel="Xóa tiêu chí"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={removeCriteria}
        />
      )}
    </Section>
  );
}

// =========================================================
// QUẢN LÝ TỔ
// =========================================================
function Groups({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberGroupId, setMemberGroupId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");

  async function load() {
    const [g, s, m] = await Promise.all([
      supabase.from("groups_").select("*").eq("class_id", classId),
      supabase.from("student_class_enrollments").select("students(id, full_name)").eq("class_id", classId).is("left_at", null),
      supabase.from("group_members").select("*, students(full_name), groups_!inner(class_id, name)").eq("groups_.class_id", classId).is("left_at", null),
    ]);
    setList(g.data || []);
    setStudents((s.data || []).map((r: any) => r.students).filter(Boolean));
    setMembers(m.data || []);
  }
  useEffect(() => { load(); }, [classId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("groups_").insert({ class_id: classId, name });
    toast.show(error ? `Lỗi: ${error.message}` : "Đã tạo tổ.", error ? "error" : "success");
    setName("");
    load();
  }

  // Lọc học sinh chưa thuộc tổ đang chọn
  const memberStudentIdsInGroup = new Set(
    members.filter((m) => m.group_id === memberGroupId).map((m) => m.student_id)
  );
  const availableStudents = students
    .filter((s) => !memberStudentIdsInGroup.has(s.id))
    .filter((s) => !studentSearch || s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()));

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  }

  function toggleAll() {
    if (availableStudents.length === 0) return;
    const allSelected = availableStudents.every((s) => selectedStudentIds.has(s.id));
    if (allSelected) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(availableStudents.map((s) => s.id)));
    }
  }

  async function addMembers() {
    if (!memberGroupId || selectedStudentIds.size === 0) return;
    const rows = Array.from(selectedStudentIds).map((studentId) => ({
      group_id: memberGroupId,
      student_id: studentId,
    }));
    const { error } = await supabase.from("group_members").insert(rows);
    toast.show(
      error ? `Lỗi: ${error.message}` : `Đã thêm ${rows.length} học sinh vào tổ.`,
      error ? "error" : "success"
    );
    setSelectedStudentIds(new Set());
    setStudentSearch("");
    load();
  }

  async function removeMember(memberId: string) {
    const member = members.find((item) => item.id === memberId);
    if (member?.is_leader) {
      await supabase.from("class_officers").update({ status: "removed", removed_at: new Date().toISOString() })
        .eq("group_id", member.group_id).eq("student_id", member.student_id).eq("status", "active");
    }
    const { error } = await supabase.from("group_members").update({ left_at: new Date().toISOString(), is_leader: false }).eq("id", memberId);
    toast.show(error ? `Lỗi: ${error.message}` : "Đã chuyển học sinh khỏi tổ.", error ? "error" : "success");
    load();
  }

  return (
    <Section title="Quản lý tổ">
      {/* Tạo tổ */}
      <form onSubmit={create} className="flex items-end gap-2 mb-6">
        <div>
          <label className="field-label">Tên tổ</label>
          <input className="field-input w-32" placeholder="Tổ 1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <button type="submit" className="btn-secondary">Tạo tổ</button>
      </form>

      {/* Thêm nhiều học sinh vào tổ */}
      <div className="mb-6 rounded-lg border border-border bg-paper-muted p-4">
        <h4 className="mb-3 font-medium text-ink">Thêm học sinh vào tổ</h4>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="field-label">Chọn tổ</label>
            <select className="field-input w-40" value={memberGroupId} onChange={(e) => { setMemberGroupId(e.target.value); setSelectedStudentIds(new Set()); }}>
              <option value="">-- Chọn tổ --</option>
              {list.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Tìm học sinh</label>
            <input className="field-input w-52" placeholder="Nhập tên..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
          </div>
        </div>

        {memberGroupId && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-ink-muted">
                {availableStudents.length} học sinh chưa thuộc tổ này
                {selectedStudentIds.size > 0 && <span className="ml-2 font-medium text-ink">· Đã chọn {selectedStudentIds.size}</span>}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost text-xs" onClick={toggleAll}>
                  {availableStudents.length > 0 && availableStudents.every((s) => selectedStudentIds.has(s.id)) ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={selectedStudentIds.size === 0}
                  onClick={addMembers}
                >
                  Thêm {selectedStudentIds.size > 0 ? `${selectedStudentIds.size} học sinh` : ""} vào tổ
                </button>
              </div>
            </div>
            {availableStudents.length === 0 ? (
              <p className="text-sm text-ink-muted py-3">Tất cả học sinh đã thuộc tổ này hoặc không tìm thấy kết quả.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded border border-line bg-white">
                {availableStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-paper-muted cursor-pointer border-b border-line last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(s.id)}
                      onChange={() => toggleStudent(s.id)}
                    />
                    <span className="text-sm">{s.full_name}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Danh sách thành viên hiện tại */}
      {members.length === 0 ? (
        <EmptyState message="Chưa có học sinh nào trong tổ." />
      ) : (
        <table className="data-table mt-5">
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="text-ink-muted">{m.groups_?.name}</td>
                <td>{m.students?.full_name} {m.is_leader && <span className="badge-gold ml-1">Tổ trưởng</span>}</td>
                <td><button className="btn-ghost" onClick={() => removeMember(m.id)}>Chuyển khỏi tổ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

// =========================================================
// BAN CÁN SỰ LỚP
// =========================================================
function ClassOfficers({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [studentId, setStudentId] = useState("");
  const [position, setPosition] = useState("class_monitor");
  const [groupId, setGroupId] = useState("");
  const [selectedOfficerId, setSelectedOfficerId] = useState("");
  const [permissionDraft, setPermissionDraft] = useState<Set<string>>(new Set());
  const [savingPermissions, setSavingPermissions] = useState(false);

  async function load() {
    const [s, g, o] = await Promise.all([
      supabase.from("student_class_enrollments").select("students(id, full_name)").eq("class_id", classId).is("left_at", null),
      supabase.from("groups_").select("*").eq("class_id", classId),
      supabase.from("class_officers").select("*, students(full_name), groups_(name), officer_permissions(permission_key)").eq("class_id", classId).eq("status", "active"),
    ]);
    setStudents((s.data || []).map((r: any) => r.students).filter(Boolean));
    setGroups(g.data || []);
    setOfficers(o.data || []);
  }
  useEffect(() => { load(); }, [classId]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { class_id: classId, student_id: studentId, position };
    if (position === "group_leader") {
      if (!groupId) {
        toast.show("Cần chọn tổ khi chỉ định tổ trưởng.", "error");
        return;
      }
      payload.group_id = groupId;
    }
    const { error } = await supabase.from("class_officers").insert(payload);
    if (!error && position === "group_leader") {
      await supabase.from("group_members").update({ is_leader: false }).eq("group_id", groupId);
      await supabase.from("group_members").update({ is_leader: true }).eq("group_id", groupId).eq("student_id", studentId).is("left_at", null);
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã chỉ định.", error ? "error" : "success");
    load();
  }

  async function remove(officerId: string) {
    const officer = officers.find((item) => item.id === officerId);
    const { error } = await supabase.from("class_officers").update({ status: "removed", removed_at: new Date().toISOString() }).eq("id", officerId);
    if (!error && officer?.position === "group_leader" && officer.group_id) {
      await supabase.from("group_members").update({ is_leader: false }).eq("group_id", officer.group_id).eq("student_id", officer.student_id).is("left_at", null);
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã bãi nhiệm.", error ? "error" : "success");
    load();
  }

  function selectOfficer(officerId: string) {
    setSelectedOfficerId(officerId);
    const officer = officers.find((item) => item.id === officerId);
    setPermissionDraft(new Set((officer?.officer_permissions || []).map((permission: any) => permission.permission_key)));
  }

  function togglePermission(permissionKey: string) {
    setPermissionDraft((previous) => {
      const next = new Set(previous);
      if (next.has(permissionKey)) next.delete(permissionKey); else next.add(permissionKey);
      return next;
    });
  }

  function applySuggestedPermissions() {
    const officer = officers.find((item) => item.id === selectedOfficerId);
    setPermissionDraft(new Set(DEFAULT_OFFICER_PERMISSIONS[officer?.position] || []));
  }

  async function savePermissions() {
    if (!selectedOfficerId) return;
    setSavingPermissions(true);
    try {
      await callApi("/api/officers/permissions/save", { class_id: classId, officer_id: selectedOfficerId, permission_keys: Array.from(permissionDraft) });
      toast.show("Đã lưu phân quyền quản lý lớp.", "success"); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setSavingPermissions(false); }
  }

  const selectedOfficer = officers.find((item) => item.id === selectedOfficerId);

  return (
    <Section title="Ban cán sự lớp" description="Chọn thành viên và mở từng quyền quản lý lớp. Nếu học sinh chưa có tài khoản, quyền sẽ tự áp dụng khi tạo tài khoản.">
      <form onSubmit={assign} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Học sinh</label>
          <select className="field-input w-48" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Chức vụ</label>
          <select className="field-input w-48" value={position} onChange={(e) => setPosition(e.target.value)}>
            {Object.entries(OFFICER_POSITION_LABELS).filter(([key]) => key !== "secretary").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {position === "group_leader" && (
          <div>
            <label className="field-label">Tổ</label>
            <select className="field-input w-32" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary">Chỉ định</button>
      </form>

      {officers.length === 0 ? (
        <EmptyState message="Chưa có cán bộ lớp nào." />
      ) : (
        <table className="data-table mt-5">
          <tbody>
            {officers.map((o) => (
              <tr key={o.id}>
                <td>{o.students?.full_name}</td>
                <td>
                  <span className="badge-neutral">{OFFICER_POSITION_LABELS[o.position] || o.position}{o.groups_ ? ` · ${o.groups_.name}` : ""}</span>
                </td>
                <td className="whitespace-nowrap"><button className="btn-secondary" onClick={() => selectOfficer(o.id)}>Phân quyền</button>{" "}<button className="btn-ghost" onClick={() => remove(o.id)}>Bãi nhiệm</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {officers.length > 0 && <div className="mt-7 rounded-lg border border-line bg-paper p-5"><div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1"><label className="field-label">Thành viên ban cán sự</label><select className="field-input" value={selectedOfficerId} onChange={(e) => selectOfficer(e.target.value)}><option value="">-- Chọn thành viên --</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.students?.full_name} · {OFFICER_POSITION_LABELS[officer.position] || officer.position}{officer.groups_ ? ` · ${officer.groups_.name}` : ""}</option>)}</select></div>{selectedOfficer && <button type="button" className="btn-secondary" onClick={applySuggestedPermissions}>Áp dụng quyền gợi ý</button>}</div>{selectedOfficer && <><div className="mt-4 rounded border border-gold/30 bg-gold-bg/30 px-3 py-2 text-sm text-ink-muted">Phạm vi cố định: {selectedOfficer.position === "group_leader" ? `chỉ thành viên ${selectedOfficer.groups_?.name || "trong tổ"}` : selectedOfficer.position === "vice_monitor_academic" ? "toàn lớp, ưu tiên nhóm tiêu chí Học tập" : "toàn lớp"}. Quyền duyệt điểm và duyệt thông báo chỉ có hiệu lực với lớp trưởng; không cho phép sửa điểm, điểm danh, sổ đầu bài hoặc khóa tuần.</div><div className="mt-5 grid gap-5 md:grid-cols-3">{OFFICER_PERMISSION_GROUPS.map((group) => <div key={group.label}><h4 className="mb-2 font-medium text-ink">{group.label}</h4><div className="space-y-2">{group.items.map((permission) => { const forumPublisher = selectedOfficer.position === "class_monitor" || selectedOfficer.position === "vice_monitor_academic"; const disabled = ((permission.key === "approve_scores" || permission.key === "approve_forum_posts") && selectedOfficer.position !== "class_monitor") || ((permission.key === "create_forum_posts" || permission.key === "publish_forum_without_review") && !forumPublisher); return <label key={permission.key} className={`flex items-start gap-2 rounded border border-line bg-white p-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><input type="checkbox" className="mt-0.5" checked={permissionDraft.has(permission.key)} disabled={disabled} onChange={() => togglePermission(permission.key)} /><span>{permission.label}</span></label>; })}</div></div>)}</div><div className="mt-5 flex justify-end"><button type="button" className="btn-primary" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Đang lưu..." : "Lưu phân quyền"}</button></div></>}</div>}
    </Section>
  );
}

// =========================================================
// BÁO CÁO TUẦN GỬI PHỤ HUYNH
// =========================================================
function ParentReports({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekId, setWeekId] = useState("");
  const [workspace, setWorkspace] = useState<any>(null);
  const [sendMode, setSendMode] = useState("manual");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, string>>({});
  const [previewStudent, setPreviewStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setWorkspace(null);
    setWeekId("");
    setSelectedIds(new Set());
    supabase.from("competition_weeks").select("id,week_number,start_date,end_date,status")
      .eq("class_id", classId).eq("academic_term_id", academicTermId)
      .order("week_number", { ascending: false })
      .then(({ data, error }) => {
        if (error) { toast.show(`Lỗi tải tuần: ${error.message}`, "error"); return; }
        const rows = data || [];
        setWeeks(rows);
        setWeekId(rows.find((week: any) => week.status === "locked")?.id || rows[0]?.id || "");
      });
  }, [classId, academicTermId]);

  async function loadWorkspace() {
    if (!weekId) { setWorkspace(null); return; }
    setLoading(true);
    try {
      const result = await callApiGet(`/api/parent-reports/weekly?class_id=${encodeURIComponent(classId)}&academic_term_id=${encodeURIComponent(academicTermId)}&week_id=${encodeURIComponent(weekId)}`);
      setWorkspace(result);
      setSendMode(result.config?.send_mode || "manual");
      setComments(Object.fromEntries((result.students || []).map((row: any) => [row.student_id, row.homeroom_comment || ""])));
      setSelectedIds(new Set());
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadWorkspace(); }, [weekId]);

  async function saveConfig() {
    if (savingConfig) return;
    setSavingConfig(true);
    try {
      await callApi("/api/parent-reports/config", { class_id: classId, academic_term_id: academicTermId, send_mode: sendMode });
      toast.show(sendMode === "auto_on_lock" ? "Đã bật gửi tự động khi chốt tuần." : "Đã chuyển sang gửi thủ công.", "success");
      await loadWorkspace();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setSavingConfig(false); }
  }

  const students = workspace?.students || [];
  const sendable = students.filter((row: any) => row.email_valid && !["queued", "sent"].includes(row.status));
  const allSelected = sendable.length > 0 && sendable.every((row: any) => selectedIds.has(row.student_id));

  function toggleAll() {
    setSelectedIds(new Set(allSelected ? [] : sendable.map((row: any) => row.student_id)));
  }
  function toggleStudent(studentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  }

  async function sendReports(studentIds: string[]) {
    if (!studentIds.length || sending) return;
    setSending(true);
    try {
      const result = await callApi("/api/parent-reports/send", {
        class_id: classId,
        academic_term_id: academicTermId,
        week_id: weekId,
        student_ids: studentIds,
        comments,
      });
      const summary = (result.provider === "gmail" ? `Đã gửi ${result.queued} email` : `Đã đưa ${result.queued} email vào hàng đợi`) +
        (result.missing_email ? `, ${result.missing_email} học sinh thiếu email` : "") +
        (result.failed ? `, ${result.failed} email lỗi` : "") + ".";
      toast.show(summary, result.failed ? "error" : "success");
      await loadWorkspace();
    } catch (err: any) { toast.show(`Lỗi gửi báo cáo: ${err.message}`, "error"); }
    finally { setSending(false); }
  }

  const statusView = (row: any) => {
    if (row.status === "queued" || row.status === "sent") return <span className="badge-add">Đã gửi</span>;
    if (row.status === "failed") return <span className="badge-deduct" title={row.error_reason || ""}>Gửi lỗi</span>;
    if (!row.email_valid || row.status === "missing_email") return <span className="badge-neutral">Thiếu email</span>;
    return <span className="badge-gold">Chưa gửi</span>;
  };

  return <>
    <Section title="Báo cáo phụ huynh" description="Gửi kết quả thi đua tuần đến email phụ huynh. Chỉ gửi dữ liệu chính thức sau khi tuần đã chốt.">
      <div className="grid gap-4 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
        <div><label className="field-label">Tuần báo cáo</label><select className="field-input" value={weekId} onChange={(e) => setWeekId(e.target.value)} disabled={loading || sending}>{weeks.map((week) => <option key={week.id} value={week.id}>Tuần {week.week_number} · {week.status === "locked" ? "Đã chốt" : "Đang mở"}</option>)}</select></div>
        <div><label className="field-label">Cách gửi của lớp trong học kỳ này</label><select className="field-input" value={sendMode} onChange={(e) => setSendMode(e.target.value)} disabled={savingConfig || sending}><option value="manual">GVCN gửi thủ công hàng loạt</option><option value="auto_on_lock">Tự động gửi khi GVCN chốt tuần</option></select></div>
        <button type="button" className="btn-secondary" disabled={savingConfig || sending || !weekId} onClick={saveConfig}>{savingConfig ? "Đang lưu..." : "Lưu cấu hình"}</button>
      </div>
      {sendMode === "auto_on_lock" && <div className="mt-3 rounded border border-gold/30 bg-gold-bg/40 p-3 text-sm text-ink-muted">Từ lần chốt tuần tiếp theo, hệ thống tự gửi báo cáo cho toàn bộ học sinh có email phụ huynh hợp lệ. Tuần đã chốt trước khi bật cấu hình không tự gửi lại.</div>}
      {workspace && !workspace.sender_ready && <div className="mt-3 rounded border border-deduct/30 bg-deduct-bg p-3 text-sm text-deduct">Máy chủ chưa cấu hình đầy đủ nhà cung cấp email {workspace.email_provider === "gmail" ? "Gmail SMTP" : "Resend"}.</div>}

      {!weekId ? <EmptyState message="Học kỳ chưa có tuần thi đua." /> : loading ? <p className="mt-5 text-sm text-ink-muted">Đang tạo bản xem trước...</p> : students.length === 0 ? <EmptyState message="Lớp chưa có học sinh." /> : <>
        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-muted">{students.filter((row: any) => row.status === "queued" || row.status === "sent").length}/{students.length} học sinh đã gửi · {students.filter((row: any) => !row.email_valid).length} thiếu email</div>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={!sendable.length || sending || workspace.week.status !== "locked"} onClick={toggleAll}>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả chưa gửi"}</button><button type="button" className="btn-secondary" disabled={!selectedIds.size || sending || workspace.week.status !== "locked"} onClick={() => sendReports(Array.from(selectedIds))}>{sending ? "Đang gửi..." : `Gửi đã chọn (${selectedIds.size})`}</button><button type="button" className="btn-primary" disabled={!sendable.length || sending || workspace.week.status !== "locked"} onClick={() => sendReports(sendable.map((row: any) => row.student_id))}>{sending ? "Đang gửi hàng loạt..." : `Gửi tất cả chưa gửi (${sendable.length})`}</button></div>
        </div>
        {workspace.week.status !== "locked" && <div className="mb-4 rounded border border-line bg-paper p-3 text-sm text-ink-muted">Tuần đang mở: bạn có thể xem trước nhưng phải chốt tuần trước khi gửi.</div>}
        <div className="overflow-x-auto"><table className="data-table min-w-[1200px]"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả học sinh chưa gửi" checked={allSelected} disabled={!sendable.length || sending || workspace.week.status !== "locked"} onChange={toggleAll} /></th><th>Học sinh</th><th>Email phụ huynh</th><th>Tuyên dương</th><th>Vi phạm</th><th>Điểm</th><th>Nhận xét GVCN</th><th>Trạng thái</th><th></th></tr></thead><tbody>{students.map((row: any) => { const canSelect = row.email_valid && !["queued", "sent"].includes(row.status) && workspace.week.status === "locked"; return <tr key={row.student_id}><td><input type="checkbox" aria-label={`Chọn ${row.student_name}`} checked={selectedIds.has(row.student_id)} disabled={!canSelect || sending} onChange={() => toggleStudent(row.student_id)} /></td><td className="font-medium">{row.student_name}<div className="text-xs font-normal text-ink-muted">{row.student_code}</div></td><td>{row.parent_email || "—"}</td><td><span className="badge-add">+{row.total_add}</span><div className="mt-1 text-xs text-ink-muted">{row.achievements.length} ghi nhận</div></td><td><span className="badge-deduct">−{row.total_deduct}</span><div className="mt-1 text-xs text-ink-muted">{row.violations.length} ghi nhận</div></td><td><span className="font-semibold">{row.start_score} → {row.final_score}</span><div className="text-xs text-ink-muted">{row.rank_label || "—"}</div></td><td><textarea className="field-input min-h-20 w-64" maxLength={2000} value={comments[row.student_id] || ""} disabled={["queued", "sent"].includes(row.status) || sending} onChange={(e) => setComments({ ...comments, [row.student_id]: e.target.value })} placeholder="Nhận xét riêng cho phụ huynh..." /></td><td>{statusView(row)}{row.sent_at && <div className="mt-1 text-xs text-ink-muted">{new Date(row.sent_at).toLocaleString("vi-VN")}</div>}</td><td><button type="button" className="btn-ghost" onClick={() => setPreviewStudent(row)}>Xem trước</button></td></tr>; })}</tbody></table></div>
      </>}
    </Section>

    {previewStudent && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setPreviewStudent(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}><h3 className="font-serif text-xl">Bản xem trước · {previewStudent.student_name}</h3><p className="mt-1 text-sm text-ink-muted">Gửi đến: {previewStudent.parent_email || "Chưa có email"}</p><div className="mt-5 space-y-4 rounded-lg border border-line bg-paper p-5 text-sm"><p>Xin chào phụ huynh của em <strong>{previewStudent.student_name}</strong>,</p><p>Đây là email tự động thông báo hoạt động của học sinh trong Tuần {workspace?.week?.week_number}, từ {workspace?.week?.start_date} đến {workspace?.week?.end_date}.</p><div><strong>Tuyên dương</strong>{previewStudent.achievements.length ? <ul className="mt-1 list-disc pl-5">{previewStudent.achievements.map((item: any, index: number) => <li key={index}>{item.name} (+{item.points} điểm)</li>)}</ul> : <p>Không có ghi nhận.</p>}</div><div><strong>Vi phạm</strong>{previewStudent.violations.length ? <ul className="mt-1 list-disc pl-5">{previewStudent.violations.map((item: any, index: number) => <li key={index}>{item.name} ({item.points} điểm)</li>)}</ul> : <p>Không có ghi nhận.</p>}</div><p>Điểm đầu tuần: {previewStudent.start_score}<br />Điểm cộng: +{previewStudent.total_add}<br />Điểm trừ: −{previewStudent.total_deduct}<br /><strong>Điểm cuối tuần: {previewStudent.final_score}</strong></p><p>Nhận xét GVCN: {comments[previewStudent.student_id] || "Không có nhận xét thêm."}</p></div><div className="mt-5 flex justify-end"><button type="button" className="btn-secondary" onClick={() => setPreviewStudent(null)}>Đóng</button></div></div></div>}
  </>;
}

// =========================================================
// TUẦN THI ĐUA
// =========================================================
function Weeks({ classId, schoolYearId, academicTermId, termStartDate, termEndDate, toast }: { classId: string; schoolYearId: string; academicTermId: string; termStartDate: string; termEndDate: string; toast: ToastApi }) {
  const [list, setList] = useState<any[]>([]);
  const [criteriaList, setCriteriaList] = useState<any[]>([]);
  const [weekCriteria, setWeekCriteria] = useState<Record<string, string[]>>({});
  const [weekNumber, setWeekNumber] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<Set<string>>(new Set());
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [lockingWeekId, setLockingWeekId] = useState<string | null>(null);

  async function load() {
    const [weeksResult, criteriaResult, linksResult] = await Promise.all([
      supabase.from("competition_weeks").select("*").eq("class_id", classId).eq("academic_term_id", academicTermId).order("week_number"),
      supabase.from("criteria").select("*").eq("class_id", classId).eq("status", "active").order("code"),
      supabase.from("competition_week_criteria").select("week_id, criteria_id").eq("class_id", classId),
    ]);
    setList(weeksResult.data || []);
    const availableCriteria = criteriaResult.data || [];
    setCriteriaList(availableCriteria);
    setSelectedCriteriaIds(new Set(availableCriteria.map((criteria: any) => criteria.id)));
    const availableCriteriaIds = new Set(availableCriteria.map((criteria: any) => criteria.id));
    const groupedLinks: Record<string, string[]> = {};
    (linksResult.data || []).forEach((link: any) => {
      if (availableCriteriaIds.has(link.criteria_id)) {
        groupedLinks[link.week_id] = [...(groupedLinks[link.week_id] || []), link.criteria_id];
      }
    });
    setWeekCriteria(groupedLinks);
  }
  useEffect(() => { load(); }, [classId, academicTermId]);

  function resetForm(selectAll = true) {
    setEditingWeekId(null);
    setWeekNumber(1);
    setStartDate("");
    setEndDate("");
    setSelectedCriteriaIds(new Set(selectAll ? criteriaList.map((criteria) => criteria.id) : []));
  }

  function toggleCriteria(criteriaId: string) {
    setSelectedCriteriaIds((previous) => {
      const next = new Set(previous);
      if (next.has(criteriaId)) next.delete(criteriaId); else next.add(criteriaId);
      return next;
    });
  }

  function toggleAllCriteria() {
    const allSelected = criteriaList.length > 0 && criteriaList.every((criteria) => selectedCriteriaIds.has(criteria.id));
    setSelectedCriteriaIds(new Set(allSelected ? [] : criteriaList.map((criteria) => criteria.id)));
  }

  function startEdit(week: any) {
    setEditingWeekId(week.id);
    setWeekNumber(week.week_number);
    setStartDate(week.start_date);
    setEndDate(week.end_date);
    setSelectedCriteriaIds(new Set(weekCriteria[week.id] || []));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolYearId) {
      toast.show("Chưa có năm học đang hoạt động.", "error");
      return;
    }
    if (selectedCriteriaIds.size === 0) {
      toast.show("Phải chọn ít nhất một tiêu chí cho tuần thi đua.", "error");
      return;
    }
    try {
      await callApi(editingWeekId ? "/api/weeks/update" : "/api/weeks/create", {
        week_id: editingWeekId,
        class_id: classId,
        school_year_id: schoolYearId,
        academic_term_id: academicTermId,
        week_number: weekNumber,
        start_date: startDate,
        end_date: endDate,
        criteria_ids: Array.from(selectedCriteriaIds),
      });
      toast.show(editingWeekId ? "Đã cập nhật tuần thi đua." : "Đã tạo tuần thi đua.", "success");
      resetForm();
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function doLock(weekId: string) {
    if (lockingWeekId) return;
    setLockingWeekId(weekId);
    try {
      const result = await callApi("/api/weeks/lock", { week_id: weekId, class_id: classId });
      const report = result.parent_report;
      if (report?.error) toast.show(`Đã chốt tuần nhưng chưa gửi được email: ${report.error}`, "error");
      else if (report?.enabled) toast.show(`Đã chốt tuần và đưa ${report.queued || 0} email báo cáo vào hàng đợi${report.missing_email ? `; ${report.missing_email} học sinh thiếu email` : ""}.`, "success");
      else toast.show("Đã chốt tuần.", "success");
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally { setLockingWeekId(null); }
  }

  async function doUnlock(weekId: string, reason: string) {
    try {
      await callApi("/api/weeks/unlock", { week_id: weekId, class_id: classId, reason });
      toast.show("Đã mở khóa tuần.", "success");
      setUnlockTarget(null);
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title="Tuần thi đua" description="Mỗi tuần chỉ áp dụng những tiêu chí được chọn bên dưới.">
      <form onSubmit={save} className="rounded-lg border border-line bg-paper p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Tuần số</label>
            <input type="number" min={1} className="field-input w-20" value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} required />
          </div>
          <div>
            <label className="field-label">Bắt đầu</label>
            <input type="date" className="field-input" min={termStartDate} max={termEndDate} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Kết thúc</label>
            <input type="date" className="field-input" min={termStartDate} max={termEndDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" disabled={!schoolYearId || criteriaList.length === 0}>{editingWeekId ? "Lưu thay đổi" : "Tạo tuần"}</button>
          {editingWeekId && <button type="button" className="btn-ghost" onClick={() => resetForm()}>Hủy sửa</button>}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-ink">Tiêu chí áp dụng</div>
              <div className="text-xs text-ink-muted">Đã chọn {selectedCriteriaIds.size}/{criteriaList.length} tiêu chí</div>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={toggleAllCriteria} disabled={criteriaList.length === 0}>
              {criteriaList.length > 0 && criteriaList.every((criteria) => selectedCriteriaIds.has(criteria.id)) ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </div>
          {criteriaList.length === 0 ? (
            <p className="text-sm text-ink-muted">Hãy tạo tiêu chí thi đua trước khi tạo tuần.</p>
          ) : (
            <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {criteriaList.map((criteria) => {
                const checked = selectedCriteriaIds.has(criteria.id);
                const signedPoints = Number(criteria.points) === 0 ? "0" : `${criteria.kind === "ADD" ? "+" : "−"}${criteria.points}`;
                return (
                  <label key={criteria.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${checked ? "border-navy/30 bg-white" : "border-line bg-white/50"}`}>
                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleCriteria(criteria.id)} />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-ink">{criteria.code} · {criteria.name}</span>
                      <span className="block text-xs text-ink-muted">{criteria.category || "Chưa phân nhóm"} · {criteria.severity || "—"} · {signedPoints} điểm</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </form>

      {list.length === 0 ? (
        <EmptyState message="Chưa có tuần thi đua nào." />
      ) : (
        <table className="data-table mt-5">
          <thead><tr><th>Tuần</th><th>Thời gian</th><th>Tiêu chí</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td className="font-medium">Tuần {w.week_number}</td>
                <td className="text-ink-muted">{w.start_date} → {w.end_date}</td>
                <td className="text-ink-muted">{weekCriteria[w.id]?.length || 0} tiêu chí</td>
                <td>
                  <span className={w.status === "locked" ? "badge-neutral" : "badge-add"}>
                    {w.status === "locked" ? "Đã khóa" : "Đang mở"}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {w.status !== "locked" ? (
                    <><button type="button" className="btn-ghost" disabled={lockingWeekId !== null} onClick={() => startEdit(w)}>Sửa</button>{" "}<button type="button" className="btn-secondary" disabled={lockingWeekId !== null} onClick={() => doLock(w.id)}>{lockingWeekId === w.id ? "Đang chốt & gửi..." : "Chốt tuần"}</button></>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={() => setUnlockTarget(w.id)}>Mở khóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {unlockTarget && (
        <ConfirmModal
          title="Mở khóa tuần thi đua"
          description="Yêu cầu nhập lý do — hành động này được ghi vào audit log."
          fields={[{ key: "reason", label: "Lý do mở khóa", required: true }]}
          confirmLabel="Mở khóa"
          onCancel={() => setUnlockTarget(null)}
          onConfirm={(values) => doUnlock(unlockTarget, values.reason)}
        />
      )}
    </Section>
  );
}

// =========================================================
// DUYỆT ĐIỂM ĐANG CHỜ
// =========================================================
function PendingApprovals({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
  const [list, setList] = useState<any[]>([]);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; points: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("score_transactions")
      .select("*, students(full_name), competition_weeks!inner(academic_term_id)")
      .eq("class_id", classId)
      .eq("competition_weeks.academic_term_id", academicTermId)
      .in("status", ["DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW"])
      .order("created_at", { ascending: false });
    setList(data || []);
  }
  useEffect(() => { load(); }, [classId, academicTermId]);

  async function approve(txId: string) {
    try {
      await callApi("/api/score/approve", { transaction_id: txId, class_id: classId });
      toast.show("Đã duyệt.", "success");
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function approveAll() {
    if (!list.length || processing) return;
    setProcessing(true);
    let approved = 0;
    let failed = 0;
    try {
      for (const transaction of list) {
        try {
          await callApi("/api/score/approve", { transaction_id: transaction.id, class_id: classId });
          approved += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) toast.show(`Đã duyệt tất cả ${approved} điểm đang chờ.`, "success");
      else toast.show(`Đã duyệt ${approved} điểm, ${failed} điểm chưa thể duyệt.`, "error");
      await load();
    } finally {
      setProcessing(false);
    }
  }

  async function adjust(txId: string, adjustedPoints: string, reason: string) {
    if (!reason.trim()) {
      toast.show("Phải nhập lý do điều chỉnh.", "error");
      return;
    }
    try {
      await callApi("/api/score/adjust", { transaction_id: txId, class_id: classId, adjusted_points: Number(adjustedPoints), reason });
      toast.show("Đã điều chỉnh.", "success");
      setAdjustTarget(null);
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title={`Duyệt điểm đang chờ (${list.length})`}>
      {list.length === 0 ? (
        <EmptyState message="Không có điểm nào đang chờ duyệt." />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="btn-primary" disabled={processing} onClick={approveAll}>
              {processing ? "Đang duyệt tất cả..." : `Duyệt tất cả (${list.length})`}
            </button>
          </div>
          <table className="data-table">
            <thead><tr><th>Học sinh</th><th>Tiêu chí</th><th>Điểm hệ thống</th><th></th></tr></thead>
            <tbody>
              {list.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-medium">{tx.students?.full_name}</td>
                  <td className="text-ink-muted">{tx.criteria_code_snapshot} · {tx.criteria_name_snapshot}</td>
                  <td>
                    <span className={tx.system_points >= 0 ? "badge-add" : "badge-deduct"}>
                      {tx.system_points >= 0 ? "+" : ""}{tx.system_points}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-secondary" disabled={processing} onClick={() => approve(tx.id)}>Duyệt</button>{" "}
                    <button className="btn-ghost" disabled={processing} onClick={() => setAdjustTarget({ id: tx.id, points: tx.system_points })}>Điều chỉnh</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {adjustTarget && (
        <ConfirmModal
          title="Điều chỉnh điểm"
          description="Điểm hệ thống tính có thể sai lệch thực tế — nhập lý do để lưu vào lịch sử."
          fields={[
            { key: "adjusted_points", label: "Điểm điều chỉnh", type: "number", defaultValue: adjustTarget.points, required: true },
            { key: "reason", label: "Lý do điều chỉnh", required: true },
          ]}
          confirmLabel="Lưu điều chỉnh"
          onCancel={() => setAdjustTarget(null)}
          onConfirm={(values) => adjust(adjustTarget.id, values.adjusted_points, values.reason)}
        />
      )}
    </Section>
  );
}
