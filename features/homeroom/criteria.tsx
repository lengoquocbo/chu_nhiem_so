"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function Criteria({ classId, toast }: { classId: string; toast: ToastApi }) {
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
