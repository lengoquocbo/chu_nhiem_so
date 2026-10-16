"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function Weeks({ classId, schoolYearId, academicTermId, termStartDate, termEndDate, toast }: { classId: string; schoolYearId: string; academicTermId: string; termStartDate: string; termEndDate: string; toast: ToastApi }) {
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
