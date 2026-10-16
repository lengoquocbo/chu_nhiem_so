"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import type { ToastApi } from "./types";

export function Groups({ classId, toast }: { classId: string; toast: ToastApi }) {
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
