"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import type { ToastApi } from "./types";
import { OFFICER_POSITION_LABELS, OFFICER_PERMISSION_GROUPS, DEFAULT_OFFICER_PERMISSIONS } from "./officer-config";

export function ClassOfficers({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [studentId, setStudentId] = useState("");
  const [position, setPosition] = useState("class_monitor");
  const [groupId, setGroupId] = useState("");
  const [selectedOfficerId, setSelectedOfficerId] = useState("");
  const [permissionDraft, setPermissionDraft] = useState<Set<string>>(new Set());
  const [savingPermissions, setSavingPermissions] = useState(false);

  async function load() {
    const [s, g, o] = await Promise.all([
      supabase.from("student_class_enrollments").select("students(id, full_name)").eq("class_id", classId).is("left_at", null),
      supabase.from("groups_").select("*").eq("class_id", classId),
      supabase.from("class_officers").select("*, students(full_name), groups_(name), officer_permissions(permission_key)").eq("class_id", classId).eq("status", "active"),
    ]);
    setStudents((s.data || []).map((r: any) => r.students).filter(Boolean));
    setGroups(g.data || []);
    setOfficers(o.data || []);
  }
  useEffect(() => { load(); }, [classId]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { class_id: classId, student_id: studentId, position };
    if (position === "group_leader") {
      if (!groupId) {
        toast.show("Cần chọn tổ khi chỉ định tổ trưởng.", "error");
        return;
      }
      payload.group_id = groupId;
    }
    const { error } = await supabase.from("class_officers").insert(payload);
    if (!error && position === "group_leader") {
      await supabase.from("group_members").update({ is_leader: false }).eq("group_id", groupId);
      await supabase.from("group_members").update({ is_leader: true }).eq("group_id", groupId).eq("student_id", studentId).is("left_at", null);
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã chỉ định.", error ? "error" : "success");
    load();
  }

  async function remove(officerId: string) {
    const officer = officers.find((item) => item.id === officerId);
    const { error } = await supabase.from("class_officers").update({ status: "removed", removed_at: new Date().toISOString() }).eq("id", officerId);
    if (!error && officer?.position === "group_leader" && officer.group_id) {
      await supabase.from("group_members").update({ is_leader: false }).eq("group_id", officer.group_id).eq("student_id", officer.student_id).is("left_at", null);
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã bãi nhiệm.", error ? "error" : "success");
    load();
  }

  function selectOfficer(officerId: string) {
    setSelectedOfficerId(officerId);
    const officer = officers.find((item) => item.id === officerId);
    setPermissionDraft(new Set((officer?.officer_permissions || []).map((permission: any) => permission.permission_key)));
  }

  function togglePermission(permissionKey: string) {
    setPermissionDraft((previous) => {
      const next = new Set(previous);
      if (next.has(permissionKey)) next.delete(permissionKey); else next.add(permissionKey);
      return next;
    });
  }

  function applySuggestedPermissions() {
    const officer = officers.find((item) => item.id === selectedOfficerId);
    setPermissionDraft(new Set(DEFAULT_OFFICER_PERMISSIONS[officer?.position] || []));
  }

  async function savePermissions() {
    if (!selectedOfficerId) return;
    setSavingPermissions(true);
    try {
      await callApi("/api/officers/permissions/save", { class_id: classId, officer_id: selectedOfficerId, permission_keys: Array.from(permissionDraft) });
      toast.show("Đã lưu phân quyền quản lý lớp.", "success"); await load();
    } catch (err: any) { toast.show(`Lỗi: ${err.message}`, "error"); }
    finally { setSavingPermissions(false); }
  }

  const selectedOfficer = officers.find((item) => item.id === selectedOfficerId);

  return (
    <Section title="Ban cán sự lớp" description="Chọn thành viên và mở từng quyền quản lý lớp. Nếu học sinh chưa có tài khoản, quyền sẽ tự áp dụng khi tạo tài khoản.">
      <form onSubmit={assign} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Học sinh</label>
          <select className="field-input w-48" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Chức vụ</label>
          <select className="field-input w-48" value={position} onChange={(e) => setPosition(e.target.value)}>
            {Object.entries(OFFICER_POSITION_LABELS).filter(([key]) => key !== "secretary").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {position === "group_leader" && (
          <div>
            <label className="field-label">Tổ</label>
            <select className="field-input w-32" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn-primary">Chỉ định</button>
      </form>

      {officers.length === 0 ? (
        <EmptyState message="Chưa có cán bộ lớp nào." />
      ) : (
        <table className="data-table mt-5">
          <tbody>
            {officers.map((o) => (
              <tr key={o.id}>
                <td>{o.students?.full_name}</td>
                <td>
                  <span className="badge-neutral">{OFFICER_POSITION_LABELS[o.position] || o.position}{o.groups_ ? ` · ${o.groups_.name}` : ""}</span>
                </td>
                <td className="whitespace-nowrap"><button className="btn-secondary" onClick={() => selectOfficer(o.id)}>Phân quyền</button>{" "}<button className="btn-ghost" onClick={() => remove(o.id)}>Bãi nhiệm</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {officers.length > 0 && <div className="mt-7 rounded-lg border border-line bg-paper p-5"><div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1"><label className="field-label">Thành viên ban cán sự</label><select className="field-input" value={selectedOfficerId} onChange={(e) => selectOfficer(e.target.value)}><option value="">-- Chọn thành viên --</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.students?.full_name} · {OFFICER_POSITION_LABELS[officer.position] || officer.position}{officer.groups_ ? ` · ${officer.groups_.name}` : ""}</option>)}</select></div>{selectedOfficer && <button type="button" className="btn-secondary" onClick={applySuggestedPermissions}>Áp dụng quyền gợi ý</button>}</div>{selectedOfficer && <><div className="mt-4 rounded border border-gold/30 bg-gold-bg/30 px-3 py-2 text-sm text-ink-muted">Phạm vi cố định: {selectedOfficer.position === "group_leader" ? `chỉ thành viên ${selectedOfficer.groups_?.name || "trong tổ"}` : selectedOfficer.position === "vice_monitor_academic" ? "toàn lớp, ưu tiên nhóm tiêu chí Học tập" : "toàn lớp"}. Quyền duyệt điểm và duyệt thông báo chỉ có hiệu lực với lớp trưởng; không cho phép sửa điểm, điểm danh, sổ đầu bài hoặc khóa tuần.</div><div className="mt-5 grid gap-5 md:grid-cols-3">{OFFICER_PERMISSION_GROUPS.map((group) => <div key={group.label}><h4 className="mb-2 font-medium text-ink">{group.label}</h4><div className="space-y-2">{group.items.map((permission) => { const forumPublisher = selectedOfficer.position === "class_monitor" || selectedOfficer.position === "vice_monitor_academic"; const disabled = ((permission.key === "approve_scores" || permission.key === "approve_forum_posts") && selectedOfficer.position !== "class_monitor") || ((permission.key === "create_forum_posts" || permission.key === "publish_forum_without_review") && !forumPublisher); return <label key={permission.key} className={`flex items-start gap-2 rounded border border-line bg-white p-2 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><input type="checkbox" className="mt-0.5" checked={permissionDraft.has(permission.key)} disabled={disabled} onChange={() => togglePermission(permission.key)} /><span>{permission.label}</span></label>; })}</div></div>)}</div><div className="mt-5 flex justify-end"><button type="button" className="btn-primary" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Đang lưu..." : "Lưu phân quyền"}</button></div></>}</div>}
    </Section>
  );
}

// =========================================================
// BÁO CÁO TUẦN GỬI PHỤ HUYNH
// =========================================================
