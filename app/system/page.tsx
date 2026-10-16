"use client";

import { useEffect, useState } from "react";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { callApi, callApiGet, callApiPut, callApiDelete, setActingSchool } from "@/lib/supabaseClient";
import { RoleBadges } from "@/lib/ui/RoleBadge";

type School = { id: string; name: string; slug: string; created_at: string };
type StaffAccount = {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
  last_sign_in_at: string | null;
};

const MENU: AppMenuItem[] = [
  { id: "schools", label: "Trường học", description: "Bước 1: thêm trường", icon: "school", roles: ["system_admin"] },
  { id: "principals", label: "Hiệu trưởng", description: "Bước 2: cấp tài khoản", icon: "users", roles: ["system_admin"] },
];

function SystemWorkspace() {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState("schools");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolSaving, setSchoolSaving] = useState(false);

  // --- Tạo hiệu trưởng ---
  const [principalName, setPrincipalName] = useState("");
  const [principalEmail, setPrincipalEmail] = useState("");
  const [principalPassword, setPrincipalPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [principalSaving, setPrincipalSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // --- Danh sách nhân sự + Đổi MK + Xóa ---
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [delSaving, setDelSaving] = useState(false);

  async function loadSchools() {
    try {
      const rows = (await callApiGet("/api/system/schools")) as School[];
      setSchools(rows);
      setSelectedSchoolId((c) => c && rows.some((r) => r.id === c) ? c : "");
    } catch (error: any) {
      toast.show(`Không tải được danh sách trường: ${error.message}`, "error");
    }
  }

  async function loadStaff(sid: string) {
    if (!sid) { setStaff([]); return; }
    setStaffLoading(true);
    try {
      const rows = (await callApiGet(`/api/system/schools/${sid}/staff`)) as StaffAccount[];
      setStaff(rows);
    } catch (error: any) {
      toast.show(`Không tải được danh sách tài khoản: ${error.message}`, "error");
      setStaff([]);
    } finally { setStaffLoading(false); }
  }

  useEffect(() => { void loadSchools(); }, []);
  useEffect(() => {
    if (activeSection === "principals" && selectedSchoolId) void loadStaff(selectedSchoolId);
  }, [activeSection, selectedSchoolId]);

  async function submitSchool(event: React.FormEvent) {
    event.preventDefault();
    setSchoolSaving(true);
    try {
      const school = (await callApi("/api/system/schools", { name: schoolName.trim() })) as School;
      await loadSchools();
      setSelectedSchoolId(school.id);
      setSchoolName("");
      setActiveSection("principals");
      toast.show(`Đã thêm trường ${school.name}. Tiếp theo cấp tài khoản hiệu trưởng.`, "success");
    } catch (error: any) {
      toast.show(`Không tạo được trường: ${error.message}`, "error");
    } finally {
      setSchoolSaving(false);
    }
  }

  async function submitPrincipal(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSchoolId) {
      toast.show("Hãy chọn trường trước.", "error");
      return;
    }
    if (principalPassword.length < 12 || !/[A-Za-z]/.test(principalPassword) || !/\d/.test(principalPassword)) {
      toast.show("Mật khẩu cần ít nhất 12 ký tự, gồm chữ và số.", "error");
      return;
    }
    if (principalPassword !== confirmPassword) {
      toast.show("Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    setPrincipalSaving(true);
    try {
      await callApi(`/api/system/schools/${selectedSchoolId}/principals`, {
        email: principalEmail.trim(), full_name: principalName.trim(), password: principalPassword,
      });
      setPrincipalName("");
      setPrincipalEmail("");
      setPrincipalPassword("");
      setConfirmPassword("");
      setShowCreateForm(false);
      toast.show("Đã tạo tài khoản hiệu trưởng.", "success");
      await loadStaff(selectedSchoolId);
    } catch (error: any) {
      toast.show(`Không tạo được: ${error.message}`, "error");
    } finally {
      setPrincipalSaving(false);
    }
  }

  async function submitPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (newPw.length < 12 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      toast.show("Mật khẩu cần ít nhất 12 ký tự, gồm chữ và số.", "error");
      return;
    }
    if (newPw !== newPwConfirm) {
      toast.show("Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    setPwSaving(true);
    try {
      await callApiPut(`/api/system/schools/${selectedSchoolId}/principals/${editingUserId}/password`, { new_password: newPw });
      toast.show("Đã cập nhật mật khẩu.", "success");
      setEditingUserId("");
      setNewPw("");
      setNewPwConfirm("");
    } catch (error: any) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } finally {
      setPwSaving(false);
    }
  }

  async function doDelete() {
    setDelSaving(true);
    try {
      await callApiDelete(`/api/system/schools/${selectedSchoolId}/principals/${deletingUserId}`);
      toast.show("Đã xóa tài khoản hiệu trưởng.", "success");
      setDeletingUserId("");
      await loadStaff(selectedSchoolId);
    } catch (error: any) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } finally {
      setDelSaving(false);
    }
  }

  function manageSchool(school: School) {
    setActingSchool({ id: school.id, name: school.name });
    window.location.assign("/admin");
  }

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);

  return (
    <AppShell
      title={activeSection === "schools" ? "Trường học" : "Cấp tài khoản hiệu trưởng"}
      subtitle="Quản trị hệ thống: tạo trường trước, cấp hiệu trưởng sau"
      currentPath="/system"
      menuItems={MENU}
      activeItem={activeSection}
      onMenuSelect={setActiveSection}
    >
      {activeSection === "schools" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-line bg-white p-6">
            <h2 className="font-serif text-xl text-ink">Thêm trường học</h2>
            <p className="mt-1 text-sm text-ink-muted">Mã trường được tự tạo từ tên (ví dụ: THPT Nguyễn Trãi → thpt-nguyen-trai). Nếu trùng, hệ thống tự thêm số.</p>
            <form onSubmit={submitSchool} className="mt-5 flex flex-wrap items-end gap-3">
              <div><label className="field-label">Tên trường</label><input className="field-input w-72" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} required maxLength={160} placeholder="THPT Nguyễn Trãi" /></div>
              <button className="btn-primary" type="submit" disabled={schoolSaving}>{schoolSaving ? "Đang tạo..." : "Thêm trường"}</button>
            </form>
          </section>
          <section className="rounded-xl border border-line bg-white p-6">
            <h2 className="font-serif text-xl text-ink">Trường đã có</h2>
            {schools.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Chưa có trường. Hãy thêm trường đầu tiên ở trên.</p> : (
              <div className="mt-4 space-y-2">{schools.map((school) => (
                <div key={school.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
                  <div><div className="font-medium text-ink">{school.name}</div><div className="text-xs text-ink-muted">{school.slug}</div></div>
                  <div className="flex gap-2"><button type="button" className="btn-ghost" onClick={() => { setSelectedSchoolId(school.id); setActiveSection("principals"); }}>Cấp hiệu trưởng</button><button type="button" className="btn-primary" onClick={() => manageSchool(school)}>Quản trị trường</button></div>
                </div>
              ))}</div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* School selector */}
          <section className="rounded-xl border border-line bg-white p-6">
            <h2 className="font-serif text-xl text-ink">Hiệu trưởng</h2>
            <p className="mt-1 text-sm text-ink-muted">Chọn trường để xem và quản lý tài khoản hiệu trưởng.</p>
            <div className="mt-4">
              <label className="field-label">Trường</label>
              <select className="field-input w-72" value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
                <option value="">-- Chọn trường --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </section>
          {selectedSchoolId && (
            <section className="rounded-xl border border-line bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl text-ink">Tài khoản — {selectedSchool?.name}</h2>
                  <p className="mt-1 text-sm text-ink-muted">Hiệu trưởng và giáo viên thuộc trường. Tài khoản giáo viên do hiệu trưởng quản lý ở mục Quản trị trường.</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => setShowCreateForm(true)}>+ Thêm hiệu trưởng</button>
              </div>
              {staffLoading ? <p className="mt-4 text-sm text-ink-muted">Đang tải...</p> : staff.length === 0 ? <p className="mt-4 text-sm text-ink-muted">Trường chưa có tài khoản nhân sự nào.</p> : (
                <div className="mt-4 overflow-x-auto rounded border border-line">
                  <table className="data-table min-w-[820px]">
                    <thead>
                      <tr>
                        <th>Họ và tên</th>
                        <th>Email đăng nhập</th>
                        <th>Vai trò</th>
                        <th>Đăng nhập gần nhất</th>
                        <th className="w-40">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((member) => {
                        const isPrincipal = member.roles.includes("principal");
                        return (
                          <tr key={member.user_id}>
                            <td className="font-medium">{member.full_name || "—"}</td>
                            <td>{member.email || "—"}</td>
                            <td><RoleBadges roles={member.roles} /></td>
                            <td className="text-ink-muted">
                              {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleString("vi-VN") : "Chưa từng đăng nhập"}
                            </td>
                            <td>
                              {isPrincipal ? (
                                <div className="flex gap-2">
                                  <button type="button" className="btn-ghost" onClick={() => { setEditingUserId(member.user_id); setNewPw(""); setNewPwConfirm(""); }}>Đổi MK</button>
                                  <button type="button" className="btn-ghost text-red-600" onClick={() => setDeletingUserId(member.user_id)}>Xóa</button>
                                </div>
                              ) : (
                                <span className="text-xs text-ink-faint">Quản lý ở Quản trị trường</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {editingUserId && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="font-serif text-lg text-ink">Đổi MK — {staff.find((member) => member.user_id === editingUserId)?.email}</h3>
              <form onSubmit={submitPasswordChange} className="mt-4 flex flex-wrap items-end gap-3">
                <div><label className="field-label">MK mới</label><input type="password" className="field-input w-56" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={12} autoComplete="new-password" required /></div>
                <div><label className="field-label">Xác nhận</label><input type="password" className="field-input w-56" value={newPwConfirm} onChange={(e) => setNewPwConfirm(e.target.value)} minLength={12} autoComplete="new-password" required /></div>
                <button className="btn-primary" type="submit" disabled={pwSaving}>{pwSaving ? "Đang lưu..." : "Lưu"}</button>
                <button type="button" className="btn-ghost" onClick={() => setEditingUserId("")}>Hủy</button>
              </form>
            </section>
          )}
          {deletingUserId && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h3 className="font-serif text-lg text-ink">Xác nhận xóa</h3>
              <p className="mt-1 text-sm">Xóa <strong>{staff.find((member) => member.user_id === deletingUserId)?.email}</strong>? Không thể hoàn tác.</p>
              <div className="mt-4 flex gap-3">
                <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={doDelete} disabled={delSaving}>{delSaving ? "Đang xóa..." : "Xóa"}</button>
                <button type="button" className="btn-ghost" onClick={() => setDeletingUserId("")}>Hủy</button>
              </div>
            </section>
          )}
          {showCreateForm && (
            <section className="rounded-xl border border-line bg-white p-6">
              <h3 className="font-serif text-lg text-ink">Tạo tài khoản hiệu trưởng</h3>
              <form onSubmit={submitPrincipal} className="mt-4 flex flex-wrap items-end gap-3">
                <div><label className="field-label">Họ tên</label><input className="field-input w-56" value={principalName} onChange={(e) => setPrincipalName(e.target.value)} required /></div>
                <div><label className="field-label">Email</label><input type="email" className="field-input w-64" value={principalEmail} onChange={(e) => setPrincipalEmail(e.target.value)} required /></div>
                <div><label className="field-label">Mật khẩu</label><input type="password" className="field-input w-56" value={principalPassword} onChange={(e) => setPrincipalPassword(e.target.value)} minLength={12} autoComplete="new-password" required /></div>
                <div><label className="field-label">Xác nhận</label><input type="password" className="field-input w-56" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={12} autoComplete="new-password" required /></div>
                <button className="btn-primary" type="submit" disabled={principalSaving}>{principalSaving ? "Đang tạo..." : "Tạo"}</button>
                <button type="button" className="btn-ghost" onClick={() => setShowCreateForm(false)}>Hủy</button>
              </form>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function SystemPage() {
  const guard = useRoleGuard(["system_admin"]);
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;
  return <ToastProvider><SystemWorkspace /></ToastProvider>;
}
