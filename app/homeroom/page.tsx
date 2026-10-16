"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, callApi, callApiGet, apiUrl } from "@/lib/supabaseClient";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { ConfirmModal } from "@/lib/ui/Modal";
import { ClassCommunications } from "@/lib/ui/ClassCommunications";
import { HomeroomLessonBook } from "@/features/homeroom/lesson-book";
import { HomeroomAssessmentScores } from "@/features/homeroom/assessment-scores";
import { ClassCompetition } from "@/features/homeroom/competition";
import { ImportStudents } from "@/features/homeroom/import-students";
import { ClassManagement } from "@/features/homeroom/class-management";
import { StudentAccounts } from "@/features/homeroom/student-accounts";
import { Criteria } from "@/features/homeroom/criteria";
import { Groups } from "@/features/homeroom/groups";
import { ClassOfficers } from "@/features/homeroom/officers";
import { ParentReports } from "@/features/homeroom/parent-reports";
import { Weeks } from "@/features/homeroom/weeks";
import { PendingApprovals } from "@/features/homeroom/approvals";

type HomeroomScope = { class_term_id: string; class_id: string; class_name: string; class_code: string; school_year_id: string; school_year_name: string; school_year_status: string; academic_term_id: string; term_name: string; term_number: number; term_start_date: string; term_end_date: string; term_status: string };

const HOMEROOM_ROLES = ["homeroom_teacher", "principal", "system_admin"];
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
