"use client";

import { useEffect, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import type { ToastApi } from "./types";

export function ParentReports({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
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
