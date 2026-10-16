"use client";

import { useEffect, useState } from "react";
import { callApi, callApiDelete, callApiGet, callApiPut } from "@/lib/supabaseClient";
import { EmptyState } from "@/lib/ui/Section";
import { ConfirmModal } from "@/lib/ui/Modal";
import { RoleBadges } from "@/lib/ui/RoleBadge";
import { useToast } from "@/lib/ui/Toast";
import type { StaffAccount } from "./types";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("vi-VN") : "Chưa từng đăng nhập";
}

/**
 * Danh sách tài khoản giáo viên của trường hiện tại.
 *
 * Đi qua API (không đọc trực tiếp Supabase) vì cần email từ auth.users và vì
 * RLS không cho client đọc user_roles của người khác.
 */
export function TeacherAccountsPanel({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<StaffAccount | null>(null);
  const [revokingUser, setRevokingUser] = useState<StaffAccount | null>(null);

  async function loadStaff() {
    setLoading(true);
    try {
      setStaff((await callApiGet("/api/admin/teachers")) as StaffAccount[]);
    } catch (error: any) {
      toast.show(`Không tải được danh sách giáo viên: ${error.message}`, "error");
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadStaff(); }, [refreshKey]);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.show("Mật khẩu mới phải có ít nhất 8 ký tự.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.show("Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    setSaving(true);
    try {
      await callApiPut(`/api/admin/teachers/${editingUserId}/password`, { new_password: newPassword });
      toast.show("Đã đổi mật khẩu giáo viên. Hãy gửi mật khẩu mới cho giáo viên.", "success");
      setEditingUserId("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    setSaving(true);
    try {
      await callApiDelete(`/api/admin/teachers/${deletingUser.user_id}`);
      toast.show(`Đã xóa tài khoản ${deletingUser.full_name}.`, "success");
      setDeletingUser(null);
      await loadStaff();
      await onChanged();
    } catch (error: any) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRevoke() {
    if (!revokingUser) return;
    setSaving(true);
    try {
      await callApi(`/api/admin/teachers/${revokingUser.user_id}/revoke`, {});
      toast.show(`Đã thu hồi quyền truy cập của ${revokingUser.full_name}. Lịch sử giảng dạy được giữ nguyên.`, "success");
      setRevokingUser(null);
      await loadStaff();
      await onChanged();
    } catch (error: any) {
      toast.show(`Lỗi: ${error.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Tài khoản giáo viên thuộc trường đang quản trị. Xóa chỉ áp dụng cho giáo viên chưa có dữ liệu giảng dạy.
        </p>
        <button type="button" className="btn-secondary" onClick={loadStaff} disabled={loading}>
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {loading && staff.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Đang tải danh sách giáo viên...</p>
      ) : staff.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="Trường chưa có tài khoản giáo viên nào. Hãy tạo ở mục Tạo tài khoản người dùng." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded border border-line">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Email đăng nhập</th>
                <th>Vai trò</th>
                <th>Đăng nhập gần nhất</th>
                <th className="w-64">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.user_id}>
                  <td className="font-medium">{member.full_name || "—"}</td>
                  <td>{member.email || "—"}</td>
                  <td><RoleBadges roles={member.roles} /></td>
                  <td className="text-ink-muted">{formatDateTime(member.last_sign_in_at)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingUserId(member.user_id);
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        Đổi MK
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setRevokingUser(member)}>
                        Thu hồi
                      </button>
                      <button type="button" className="btn-danger" onClick={() => setDeletingUser(member)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUserId && (
        <form onSubmit={submitPassword} className="mt-4 flex flex-wrap items-end gap-3 rounded border border-line bg-white p-4">
          <div className="w-full">
            <p className="font-medium text-ink">
              Đổi mật khẩu — {staff.find((member) => member.user_id === editingUserId)?.email}
            </p>
          </div>
          <div>
            <label className="field-label">Mật khẩu mới</label>
            <input
              type="password"
              className="field-input w-52"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="field-label">Xác nhận mật khẩu</label>
            <input
              type="password"
              className="field-input w-52"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu mật khẩu"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditingUserId("")}>Hủy</button>
        </form>
      )}

      {deletingUser && (
        <ConfirmModal
          title="Xóa tài khoản giáo viên"
          description={`Xóa vĩnh viễn tài khoản ${deletingUser.email}? Chỉ thực hiện được khi giáo viên chưa có điểm danh, sổ đầu bài hay điểm đánh giá.`}
          confirmLabel="Xóa tài khoản"
          loading={saving}
          danger={true}
          onCancel={() => setDeletingUser(null)}
          onConfirm={confirmDelete}
        />
      )}

      {revokingUser && (
        <ConfirmModal
          title="Thu hồi quyền truy cập"
          description={`Thu hồi quyền của ${revokingUser.full_name}? Tài khoản không còn đăng nhập được vào chức năng nào, nhưng hồ sơ và toàn bộ lịch sử giảng dạy vẫn được giữ.`}
          confirmLabel="Thu hồi quyền"
          loading={saving}
          danger={true}
          onCancel={() => setRevokingUser(null)}
          onConfirm={confirmRevoke}
        />
      )}
    </div>
  );
}
