"use client";

import { useEffect, useState } from "react";
import { callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

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

export function OfficerClassWorkspace({ access }: { access: any }) {
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
