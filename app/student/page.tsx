"use client";

import { useEffect, useState } from "react";
import { callApi, callApiGet, supabase } from "@/lib/supabaseClient";
import { RoleGuardMessage, useRoleGuard } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ScoreStamp } from "@/lib/ui/ScoreStamp";
import { ClassCommunications } from "@/lib/ui/ClassCommunications";

const STUDENT_MENU: AppMenuItem[] = [
  { id: "forum", label: "Diễn đàn thông báo", description: "Thông tin mới của lớp", icon: "clipboard", roles: ["student"] },
  { id: "feedback", label: "Góp ý – phản hồi", description: "Gửi góp ý ẩn danh", icon: "users", roles: ["student"] },
  { id: "current", label: "Điểm hiện tại", description: "Kết quả tuần gần nhất", icon: "chart", roles: ["student"] },
  { id: "gradebook", label: "Bảng điểm cá nhân", description: "Điểm các môn học", icon: "clipboard", roles: ["student"] },
  { id: "weeks", label: "Lịch sử theo tuần", description: "Điểm và xếp loại", icon: "calendar", roles: ["student"] },
];

const OFFICER_MENU: AppMenuItem = { id: "class-management", label: "Quản lý lớp", description: "Chức năng ban cán sự", icon: "users", roles: ["student"] };

export default function StudentPage() {
  const guard = useRoleGuard(["student"]);
  const [activeSection, setActiveSection] = useState("current");
  const [passwordGate, setPasswordGate] = useState<"loading" | "required" | "ready" | "error">("loading");
  const [gateError, setGateError] = useState("");
  const [officerAccess, setOfficerAccess] = useState<any>({ classes: [] });
  const [communicationUnread, setCommunicationUnread] = useState({ forum: 0, feedback: 0 });

  async function loadCommunicationUnread() {
    try { setCommunicationUnread(await callApiGet("/api/communications/unread")); }
    catch { setCommunicationUnread({ forum: 0, feedback: 0 }); }
  }

  useEffect(() => {
    if (guard !== "allowed") return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) {
        setGateError(error?.message || "Không tìm thấy hồ sơ tài khoản.");
        setPasswordGate("error");
        return;
      }
      setPasswordGate(data.must_change_password ? "required" : "ready");
    })();
  }, [guard]);

  useEffect(() => {
    if (guard !== "allowed" || passwordGate !== "ready") return;
    callApiGet("/api/officers/me").then(setOfficerAccess).catch(() => setOfficerAccess({ classes: [] }));
    loadCommunicationUnread();
    const timer = window.setInterval(loadCommunicationUnread, 30000);
    return () => window.clearInterval(timer);
  }, [guard, passwordGate]);

  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;
  if (passwordGate === "loading") return <main className="grid min-h-screen place-items-center bg-paper-muted"><p className="text-ink-muted">Đang kiểm tra tài khoản...</p></main>;
  if (passwordGate === "error") return <main className="grid min-h-screen place-items-center bg-paper-muted p-6"><div className="max-w-lg rounded-lg border border-deduct/30 bg-white p-6 text-deduct">Không thể kiểm tra yêu cầu đổi mật khẩu: {gateError}</div></main>;
  if (passwordGate === "required") return <FirstLoginPasswordChange />;
  const baseMenu = STUDENT_MENU.map((item) => item.id === "forum" ? { ...item, badgeCount: communicationUnread.forum } : item.id === "feedback" ? { ...item, badgeCount: communicationUnread.feedback } : item);
  const menuItems = officerAccess.classes?.some((item: any) => item.permissions?.length) ? [...baseMenu, OFFICER_MENU] : baseMenu;
  const selected = menuItems.find((item) => item.id === activeSection) || menuItems[0];
  return <AppShell title={selected.label} subtitle="Theo dõi kết quả thi đua cá nhân" currentPath="/student" menuItems={menuItems} activeItem={activeSection} onMenuSelect={setActiveSection}><StudentContent activeSection={activeSection} officerAccess={officerAccess} onUnreadChange={loadCommunicationUnread} /></AppShell>;
}

function FirstLoginPasswordChange() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ và số.");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    try {
      await callApi("/api/student/change-password", { new_password: password });
      await supabase.auth.signOut();
      window.location.href = "/?passwordChanged=1";
    } catch (err: any) {
      setError(err.message || "Không thể đổi mật khẩu.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper-muted p-5">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg sm:p-8">
        <p className="font-serif text-3xl text-ink">Sổ điểm</p>
        <h1 className="mt-6 text-xl font-semibold text-ink">Đổi mật khẩu lần đầu</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Đây là tài khoản do giáo viên cấp. Bạn cần đặt mật khẩu mới trước khi xem dữ liệu học tập.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="field-label">Mật khẩu mới</label>
            <input type="password" className="field-input w-full" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </div>
          <div>
            <label className="field-label">Nhập lại mật khẩu mới</label>
            <input type="password" className="field-input w-full" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          </div>
          {error && <div className="rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? "Đang đổi mật khẩu..." : "Đổi mật khẩu và đăng nhập lại"}</button>
        </form>
      </div>
    </main>
  );
}

function StudentContent({ activeSection, officerAccess, onUnreadChange }: { activeSection: string; officerAccess: any; onUnreadChange: () => void }) {
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

function StudentGradebook() {
  const [gradebook, setGradebook] = useState<any | null>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextSchoolYearId = schoolYearId, nextTermId = termId) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextSchoolYearId) params.set("school_year_id", nextSchoolYearId);
      if (nextTermId) params.set("term_id", nextTermId);
      const result = await callApiGet(`/api/student/gradebook${params.size ? `?${params.toString()}` : ""}`);
      setGradebook(result);
      setSchoolYearId(result.selected_school_year_id || "");
      setTermId(result.selected_term_id || "");
      setDetail(null);
    } catch (err: any) {
      setError(err.message || "Không thể tải bảng điểm cá nhân.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load("", ""); }, []);

  function scoreList(items: any[]) {
    if (!items?.length) return <span className="text-ink-faint">—</span>;
    return <div className="flex flex-wrap gap-2">{items.map((item) => (
      <button key={item.id} type="button" className="badge-neutral hover:border-navy hover:text-navy" title="Xem chi tiết điểm" onClick={() => setDetail(item)}>{item.score}</button>
    ))}</div>;
  }

  return <>
    <Section title="Bảng điểm cá nhân" description="Điểm dò bài và điểm kiểm tra 15 phút của tất cả môn học trong học kỳ đã chọn.">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div><label className="field-label">Năm học</label><select className="field-input w-48" value={schoolYearId} disabled={loading} onChange={(event) => { setSchoolYearId(event.target.value); setTermId(""); load(event.target.value, ""); }}><option value="">-- Chọn năm học --</option>{(gradebook?.school_years || []).map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
        <div><label className="field-label">Học kỳ</label><select className="field-input w-48" value={termId} disabled={loading || !gradebook?.terms?.length} onChange={(event) => { setTermId(event.target.value); load(schoolYearId, event.target.value); }}><option value="">-- Chọn học kỳ --</option>{(gradebook?.terms || []).map((term: any) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
      </div>
      {error ? <p className="rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">Lỗi: {error}</p>
        : loading ? <p className="text-sm text-ink-muted">Đang tải bảng điểm...</p>
        : !gradebook?.school_years?.length ? <EmptyState message="Chưa có năm học nào trong hồ sơ học sinh." />
        : !gradebook?.terms?.length ? <EmptyState message="Năm học này chưa được cấu hình học kỳ." />
        : !gradebook?.subjects?.length ? <EmptyState message="Chưa có môn học hoặc điểm kiểm tra trong học kỳ này." />
        : <table className="data-table"><thead><tr><th>Môn học</th><th>Điểm dò bài</th><th>Điểm 15 phút</th></tr></thead><tbody>{gradebook.subjects.map((subject: any) => <tr key={subject.id}><td className="font-medium">{subject.name}</td><td>{scoreList(subject.oral_scores)}</td><td>{scoreList(subject.fifteen_minute_scores)}</td></tr>)}</tbody></table>}
    </Section>

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setDetail(null)}><div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-xl">Chi tiết điểm {detail.score}</h3><p className="mt-1 text-sm text-ink-muted">{detail.subjects?.name || "Môn học"} · {detail.assessment_type === "oral" ? "Dò bài" : "Kiểm tra 15 phút"}</p></div><button type="button" className="btn-ghost" aria-label="Đóng" onClick={() => setDetail(null)}>Đóng</button></div><dl className="mt-5 grid gap-4 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">Ngày kiểm tra</dt><dd className="mt-1">{new Date(`${detail.assessment_date}T00:00:00`).toLocaleDateString("vi-VN")}</dd></div><div><dt className="text-xs text-ink-muted">Tiết học</dt><dd className="mt-1">{detail.period ? `Tiết ${detail.period}` : "—"}</dd></div><div><dt className="text-xs text-ink-muted">Giáo viên nhập</dt><dd className="mt-1">{detail.profiles?.full_name || "—"}</dd></div><div><dt className="text-xs text-ink-muted">Lớp</dt><dd className="mt-1">{detail.classes?.name || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Nhận xét</dt><dd className="mt-1">{detail.comment || "—"}</dd></div></dl></div></div>}
  </>;
}

const OFFICER_PERMISSION_LABELS: Record<string, string> = {
  view_class_overview: "Xem tổng quan lớp",
  view_competition_ranking: "Xem xếp hạng toàn lớp",
  view_group_ranking: "Xem xếp hạng trong tổ",
  record_violation: "Ghi nhận vi phạm",
  record_achievement: "Ghi nhận tuyên dương",
  record_academic: "Ghi nhận học tập",
  review_officer_records: "Xác nhận ghi nhận cán sự",
  approve_scores: "Duyệt điểm thay GVCN",
  create_forum_posts: "Đăng thông báo lớp",
  publish_forum_without_review: "Tự đăng thông báo",
  approve_forum_posts: "Duyệt thông báo lớp",
  view_weekly_report: "Xem tổng hợp tuần",
};

function OfficerClassWorkspace({ access }: { access: any }) {
  const availableClasses = (access.classes || []).filter((item: any) => item.permissions?.length);
  const [classId, setClassId] = useState(availableClasses[0]?.class_id || "");
  const [weekId, setWeekId] = useState("");
  const [workspace, setWorkspace] = useState<any | null>(null);
  const [studentId, setStudentId] = useState("");
  const [criteriaCode, setCriteriaCode] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(new Set());

  async function load(targetClassId = classId, targetWeekId = weekId) {
    if (!targetClassId) return;
    try {
      const query = `/api/officers/workspace?class_id=${encodeURIComponent(targetClassId)}${targetWeekId ? `&week_id=${encodeURIComponent(targetWeekId)}` : ""}`;
      const result = await callApiGet(query);
      setWorkspace(result);
      setSelectedApprovalIds(new Set());
      if (!targetWeekId && result.selected_week_id) setWeekId(result.selected_week_id);
      if (result.students?.[0]) setStudentId((current) => current || result.students[0].id);
      const selectedWeek = result.weeks?.find((week: any) => week.id === (targetWeekId || result.selected_week_id));
      if (selectedWeek && !(selectedWeek.start_date <= eventDate && eventDate <= selectedWeek.end_date)) setEventDate(selectedWeek.start_date);
    } catch (err: any) { setMessage({ text: err.message, error: true }); }
  }

  useEffect(() => {
    const first = availableClasses[0]?.class_id || "";
    if (!classId && first) setClassId(first);
  }, [access]);
  useEffect(() => { if (classId) load(); }, [classId, weekId]);

  const permissions: string[] = workspace?.permissions || [];
  const selectedWeek = workspace?.weeks?.find((week: any) => week.id === weekId);
  const canRecord = permissions.some((key) => ["record_violation", "record_achievement", "record_academic"].includes(key));
  const availableCriteria = (workspace?.criteria || []).filter((criteria: any) =>
    (permissions.includes("record_academic") && criteria.category === "Học tập")
    || (permissions.includes("record_achievement") && criteria.kind === "ADD")
    || (permissions.includes("record_violation") && criteria.kind === "DEDUCT")
  );
  const ranking = (workspace?.students || []).map((student: any) => {
    const items = (workspace?.transactions || []).filter((transaction: any) => transaction.student_id === student.id && transaction.status !== "REJECTED");
    const total = items.reduce((sum: number, transaction: any) => sum + Number(transaction.adjusted_points ?? transaction.system_points), 0);
    return { ...student, score: 100 + total, eventCount: items.length };
  }).sort((a: any, b: any) => b.score - a.score || a.full_name.localeCompare(b.full_name, "vi"));

  async function recordEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedWeek || !criteriaCode) return;
    setSaving(true); setMessage(null);
    try {
      await callApi("/api/events", { class_id: classId, student_id: studentId, week_id: weekId, event_type_code: "CRITERIA_RECORD", criteria_code: criteriaCode, event_date: eventDate, note });
      setMessage({ text: "Đã gửi ghi nhận để kiểm tra và GVCN duyệt." }); setNote(""); await load();
    } catch (err: any) { setMessage({ text: err.message, error: true }); }
    finally { setSaving(false); }
  }

  async function confirmTransaction(transactionId: string) {
    setSaving(true); setMessage(null);
    try {
      await callApi("/api/officers/transactions/confirm", { class_id: classId, transaction_id: transactionId });
      setMessage({ text: "Đã xác nhận ghi nhận và chuyển GVCN duyệt." }); await load();
    } catch (err: any) { setMessage({ text: err.message, error: true }); }
    finally { setSaving(false); }
  }

  async function approveTransactions(transactionIds: string[]) {
    if (!transactionIds.length || saving) return;
    setSaving(true); setMessage(null);
    let approved = 0;
    let failed = 0;
    try {
      for (const transactionId of transactionIds) {
        try {
          await callApi("/api/score/approve", { class_id: classId, transaction_id: transactionId });
          approved += 1;
        } catch {
          failed += 1;
        }
      }
      setMessage(failed
        ? { text: `Đã duyệt ${approved} điểm; ${failed} điểm chưa thể duyệt.`, error: true }
        : { text: `Đã duyệt ${approved} điểm. Đồng thời đã lưu người duyệt và thời gian duyệt.` });
      await load();
    } finally { setSaving(false); }
  }

  function toggleApproval(transactionId: string) {
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) next.delete(transactionId); else next.add(transactionId);
      return next;
    });
  }

  if (!availableClasses.length) return <EmptyState message="GVCN chưa cấp quyền quản lý lớp cho tài khoản này." />;
  return <div className="space-y-8">
    <Section title="Quyền quản lý lớp" description="Bạn chỉ nhìn thấy các chức năng và học sinh nằm trong phạm vi GVCN đã cấp.">
      <div className="flex flex-wrap items-end gap-3"><div><label className="field-label">Lớp</label><select className="field-input w-48" value={classId} onChange={(event) => { setClassId(event.target.value); setWeekId(""); setStudentId(""); setCriteriaCode(""); }} >{availableClasses.map((item: any) => <option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}</select></div><div><label className="field-label">Tuần thi đua</label><select className="field-input w-48" value={weekId} onChange={(event) => { setWeekId(event.target.value); setCriteriaCode(""); }}>{(workspace?.weeks || []).map((week: any) => <option key={week.id} value={week.id}>Tuần {week.week_number} · {week.status === "locked" ? "Đã khóa" : "Đang mở"}</option>)}</select></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{permissions.map((permission) => <span key={permission} className="badge-neutral">{OFFICER_PERMISSION_LABELS[permission] || permission}</span>)}</div>
      {message && <p className={`mt-4 rounded border px-3 py-2 text-sm ${message.error ? "border-deduct/30 bg-deduct-bg text-deduct" : "border-add/30 bg-add-bg text-add"}`}>{message.text}</p>}
    </Section>

    {permissions.includes("view_class_overview") && <Section title="Tổng quan"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded border border-line bg-paper p-4"><div className="text-xs text-ink-muted">Học sinh trong phạm vi</div><div className="mt-1 text-2xl font-semibold">{workspace?.students?.length || 0}</div></div><div className="rounded border border-line bg-paper p-4"><div className="text-xs text-ink-muted">Ghi nhận trong tuần</div><div className="mt-1 text-2xl font-semibold">{workspace?.transactions?.length || 0}</div></div><div className="rounded border border-line bg-paper p-4"><div className="text-xs text-ink-muted">Chờ cán sự kiểm tra</div><div className="mt-1 text-2xl font-semibold">{workspace?.reviewable_transactions?.length || 0}</div></div></div></Section>}

    {(permissions.includes("view_competition_ranking") || permissions.includes("view_group_ranking") || permissions.includes("view_weekly_report")) && <Section title={permissions.includes("view_group_ranking") && !permissions.includes("view_competition_ranking") ? "Xếp hạng trong tổ" : "Xếp hạng thi đua"} description="Điểm tạm tính bắt đầu từ 100 và gồm cả ghi nhận đang chờ duyệt.">{ranking.length === 0 ? <EmptyState message="Chưa có học sinh trong phạm vi." /> : <table className="data-table"><thead><tr><th>Hạng</th><th>Học sinh</th><th>Số ghi nhận</th><th>Điểm tạm tính</th></tr></thead><tbody>{ranking.map((student: any, index: number) => <tr key={student.id}><td>#{index + 1}</td><td className="font-medium">{student.full_name}</td><td>{student.eventCount}</td><td className="font-semibold">{student.score}</td></tr>)}</tbody></table>}</Section>}

    {canRecord && <Section title="Ghi nhận thi đua" description="Chọn tiêu chí; hệ thống tự tính điểm. Bạn không được nhập điểm trực tiếp.">{selectedWeek?.status !== "open" ? <EmptyState message="Tuần đã khóa nên không thể tạo ghi nhận mới." /> : <form onSubmit={recordEvent} className="grid gap-3 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4"><div><label className="field-label">Học sinh</label><select className="field-input" value={studentId} onChange={(event) => setStudentId(event.target.value)} required>{(workspace?.students || []).map((student: any) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></div><div><label className="field-label">Tiêu chí</label><select className="field-input" value={criteriaCode} onChange={(event) => setCriteriaCode(event.target.value)} required><option value="">-- Chọn tiêu chí --</option>{availableCriteria.map((criteria: any) => <option key={criteria.id} value={criteria.code}>{criteria.code} · {criteria.name} · {criteria.kind === "ADD" ? "+" : "−"}{criteria.points}</option>)}</select></div><div><label className="field-label">Ngày ghi nhận</label><input type="date" className="field-input" min={selectedWeek?.start_date} max={selectedWeek?.end_date} value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></div><div><label className="field-label">Ghi chú</label><input className="field-input" value={note} onChange={(event) => setNote(event.target.value)} /></div><div className="lg:col-span-4 flex justify-end"><button className="btn-primary" disabled={saving || !availableCriteria.length}>{saving ? "Đang gửi..." : "Gửi ghi nhận"}</button></div></form>}</Section>}

    {permissions.includes("review_officer_records") && <Section title="Xác nhận ghi nhận của cán sự" description="Chỉ xác nhận sơ bộ; GVCN vẫn là người duyệt cuối cùng.">{(workspace?.reviewable_transactions || []).length === 0 ? <EmptyState message="Không có ghi nhận cán sự nào đang chờ." /> : <table className="data-table"><thead><tr><th>Học sinh</th><th>Tiêu chí</th><th>Điểm</th><th>Ngày</th><th></th></tr></thead><tbody>{workspace.reviewable_transactions.map((transaction: any) => <tr key={transaction.id}><td>{transaction.students?.full_name}</td><td>{transaction.criteria_name_snapshot}</td><td><span className={Number(transaction.system_points) >= 0 ? "badge-add" : "badge-deduct"}>{Number(transaction.system_points) >= 0 ? "+" : ""}{transaction.system_points}</span></td><td>{transaction.student_events?.event_date ? new Date(`${transaction.student_events.event_date}T00:00:00`).toLocaleDateString("vi-VN") : "—"}</td><td><button type="button" className="btn-secondary" disabled={saving} onClick={() => confirmTransaction(transaction.id)}>Xác nhận</button></td></tr>)}</tbody></table>}</Section>}

    {permissions.includes("approve_scores") && <Section title={`Duyệt điểm thay GVCN (${workspace?.approvable_transactions?.length || 0})`} description="Lớp trưởng được GVCN ủy quyền có thể duyệt điểm đang chờ. Không được sửa điểm và không thể duyệt khi tuần đã khóa.">{(workspace?.approvable_transactions || []).length === 0 ? <EmptyState message="Không có điểm nào đang chờ duyệt." /> : <><div className="mb-4 flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setSelectedApprovalIds((current) => current.size === workspace.approvable_transactions.length ? new Set() : new Set(workspace.approvable_transactions.map((transaction: any) => transaction.id)))}>{selectedApprovalIds.size === workspace.approvable_transactions.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button><button type="button" className="btn-secondary" disabled={saving || !selectedApprovalIds.size} onClick={() => approveTransactions(Array.from(selectedApprovalIds))}>Duyệt đã chọn ({selectedApprovalIds.size})</button><button type="button" className="btn-primary" disabled={saving} onClick={() => approveTransactions(workspace.approvable_transactions.map((transaction: any) => transaction.id))}>{saving ? "Đang duyệt..." : `Duyệt tất cả (${workspace.approvable_transactions.length})`}</button></div><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả điểm chờ duyệt" checked={selectedApprovalIds.size === workspace.approvable_transactions.length} onChange={() => setSelectedApprovalIds((current) => current.size === workspace.approvable_transactions.length ? new Set() : new Set(workspace.approvable_transactions.map((transaction: any) => transaction.id)))} /></th><th>Học sinh</th><th>Tiêu chí</th><th>Điểm</th><th>Ngày</th><th></th></tr></thead><tbody>{workspace.approvable_transactions.map((transaction: any) => <tr key={transaction.id}><td><input type="checkbox" aria-label={`Chọn ${transaction.criteria_name_snapshot}`} checked={selectedApprovalIds.has(transaction.id)} onChange={() => toggleApproval(transaction.id)} /></td><td>{transaction.students?.full_name}</td><td>{transaction.criteria_code_snapshot} · {transaction.criteria_name_snapshot}</td><td><span className={Number(transaction.adjusted_points ?? transaction.system_points) >= 0 ? "badge-add" : "badge-deduct"}>{Number(transaction.adjusted_points ?? transaction.system_points) >= 0 ? "+" : ""}{transaction.adjusted_points ?? transaction.system_points}</span></td><td>{transaction.student_events?.event_date ? new Date(`${transaction.student_events.event_date}T00:00:00`).toLocaleDateString("vi-VN") : "—"}</td><td><button type="button" className="btn-secondary" disabled={saving} onClick={() => approveTransactions([transaction.id])}>Duyệt</button></td></tr>)}</tbody></table></>}</Section>}
  </div>;
}
