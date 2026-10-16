"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function ClassCompetition({ classId, schoolYearId, academicTermId, termStartDate, termEndDate, toast }: { classId: string; schoolYearId: string; academicTermId: string; termStartDate: string; termEndDate: string; toast: ToastApi }) {
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
