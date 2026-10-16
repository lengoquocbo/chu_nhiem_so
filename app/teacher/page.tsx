"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { ConfirmModal } from "@/lib/ui/Modal";
import { TeacherLessonBook } from "@/features/teacher/lesson-book";
import { TeacherAssessmentScores } from "@/features/teacher/assessment-scores";
import { JoinClass } from "@/features/teacher/join-class";
import { Attendance } from "@/features/teacher/attendance";
import { RecordEvent } from "@/features/teacher/record-event";

const TEACHER_ROLES = ["subject_teacher", "principal", "system_admin"];
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
