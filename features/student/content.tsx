"use client";

import { useEffect, useState } from "react";
import { callApiGet, supabase } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";
import { ScoreStamp } from "@/lib/ui/ScoreStamp";
import { ClassCommunications } from "@/lib/ui/ClassCommunications";

import { StudentGradebook } from "./gradebook";
import { OfficerClassWorkspace } from "./officer-workspace";

export function StudentContent({ activeSection, officerAccess, onUnreadChange }: { activeSection: string; officerAccess: any; onUnreadChange: () => void }) {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState("");
  const [schoolYearId, setSchoolYearId] = useState("");
  const [academicTermId, setAcademicTermId] = useState("");
  const [weekId, setWeekId] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const isCompetitionSection = ["current", "weeks"].includes(activeSection);

  async function loadHistory(targetStudentId: string, targetYearId = schoolYearId, targetTermId = academicTermId, targetWeekId = weekId) {
    setHistoryLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (targetYearId) params.set("school_year_id", targetYearId);
      if (targetTermId) params.set("academic_term_id", targetTermId);
      if (targetWeekId) params.set("week_id", targetWeekId);
      const result = await callApiGet(`/api/reports/student/${targetStudentId}${params.size ? `?${params.toString()}` : ""}`);
      setHistory(result);
      setSchoolYearId(result.selected_school_year_id || "");
      setAcademicTermId(result.selected_term_id || "");
      setWeekId(result.selected_week_id || "");
    } catch (err: any) {
      setError(err.message);
    } finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: link } = await supabase.from("student_user_link").select("student_id").eq("user_id", user.id).maybeSingle();
      if (!link) {
        setNotLinked(true);
        return;
      }
      setStudentId(link.student_id);

      await loadHistory(link.student_id, "", "", "");
    })();
  }, []);

  useEffect(() => {
    if (!studentId || activeSection !== "current") return;
    const refresh = () => loadHistory(studentId, schoolYearId, academicTermId, weekId);
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [studentId, activeSection, schoolYearId, academicTermId, weekId]);

  function changeYear(nextYearId: string) {
    setSchoolYearId(nextYearId);
    setAcademicTermId("");
    setWeekId("");
    if (studentId) loadHistory(studentId, nextYearId, "", "");
  }

  function changeTerm(nextTermId: string) {
    setAcademicTermId(nextTermId);
    setWeekId("");
    if (studentId) loadHistory(studentId, schoolYearId, nextTermId, "");
  }

  function changeWeek(nextWeekId: string) {
    setWeekId(nextWeekId);
    if (studentId) loadHistory(studentId, schoolYearId, academicTermId, nextWeekId);
  }

  const currentSummary = history?.current_summary || history?.weekly_summary?.[0];

  return (
    <>
      {notLinked && <EmptyState message="Tài khoản này chưa được liên kết với hồ sơ học sinh. Liên hệ GVCN để được hỗ trợ." />}
      {isCompetitionSection && history && <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4">
        <div><label className="field-label">Năm học</label><select className="field-input w-48" value={schoolYearId} disabled={historyLoading} onChange={(event) => changeYear(event.target.value)}>{(history.school_years || []).map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
        <div><label className="field-label">Học kỳ</label><select className="field-input w-44" value={academicTermId} disabled={historyLoading || !history.terms?.length} onChange={(event) => changeTerm(event.target.value)}>{(history.terms || []).map((term: any) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
        {activeSection === "current" && <div><label className="field-label">Tuần</label><select className="field-input w-56" value={weekId} disabled={historyLoading || !history.weeks?.length} onChange={(event) => changeWeek(event.target.value)}>{(history.weeks || []).map((week: any) => <option key={week.id} value={week.id}>Tuần {week.week_number} · {week.status === "locked" ? "Đã khóa" : "Đang mở"}</option>)}</select></div>}
        {historyLoading && <span className="text-sm text-ink-muted">Đang tải dữ liệu...</span>}
      </div>}
      {isCompetitionSection && error && <p className="text-sm text-deduct">Lỗi: {error}</p>}
      {isCompetitionSection && !notLinked && !history && !error && <p className="text-sm text-ink-muted">Đang tải...</p>}

      {history && (
        <>
          {activeSection === "current" && <>
            <Section title="Điểm hiện tại">
              {currentSummary ? (
                <><div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted"><span>Tuần {currentSummary.competition_weeks?.week_number}</span>{currentSummary.competition_weeks?.status === "open" ? <span className="badge-gold">Tạm tính · đang mở</span> : <span className="badge-add">Đã chốt</span>}</div><ScoreStamp
                  score={currentSummary.final_score}
                  rankLabel={currentSummary.rank_label}
                  totalAdd={currentSummary.total_add}
                  totalDeduct={currentSummary.total_deduct}
                /></>
              ) : (
                <EmptyState message="Chưa có dữ liệu điểm tuần này." />
              )}
            </Section>
            <Section title="Chi tiết cộng trừ trong tuần" description="Các tiêu chí đã được duyệt hoặc điều chỉnh tạo nên điểm của tuần đang chọn.">
              {history.recent_transactions.length === 0 ? (
                <EmptyState message="Tuần này chưa có sự việc nào được ghi nhận." />
              ) : (
                <table className="data-table">
                  <thead><tr><th>Ngày</th><th>Tiêu chí</th><th>Điểm</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {history.recent_transactions.map((t: any) => {
                      const points = t.adjusted_points ?? t.system_points;
                      return (
                        <tr key={t.id}>
                          <td className="text-ink-muted">{new Date(t.created_at).toLocaleDateString("vi-VN")}</td>
                          <td>{t.criteria_name_snapshot}</td>
                          <td><span className={points >= 0 ? "badge-add" : "badge-deduct"}>{points >= 0 ? "+" : ""}{points}</span></td>
                          <td className="text-ink-muted text-xs">{t.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          </>}

          {activeSection === "weeks" && <Section title="Lịch sử theo tuần">
            {history.weekly_summary.length === 0 ? (
              <EmptyState message="Chưa có lịch sử." />
            ) : (
              <table className="data-table">
                <thead><tr><th>Tuần</th><th>Điểm cuối</th><th>Xếp loại</th></tr></thead>
                <tbody>
                  {history.weekly_summary.map((w: any) => (
                    <tr key={w.id}>
                      <td className="text-ink-muted">Tuần {w.competition_weeks?.week_number ?? w.week_id.slice(0, 8)}</td>
                      <td className="font-medium">{w.final_score}</td>
                      <td>{w.rank_label && <span className="badge-neutral">{w.rank_label}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>}

        </>
      )}
      {activeSection === "gradebook" && !notLinked && <StudentGradebook />}
      {activeSection === "forum" && !notLinked && <ClassCommunications view="forum" studentMode onUnreadChange={onUnreadChange} />}
      {activeSection === "feedback" && !notLinked && <ClassCommunications view="feedback" studentMode onUnreadChange={onUnreadChange} />}
      {activeSection === "class-management" && <OfficerClassWorkspace access={officerAccess} />}
    </>
  );
}
