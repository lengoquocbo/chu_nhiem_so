"use client";

import { useEffect, useState } from "react";
import { supabase, callApi, callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function StudentAccounts({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [students, setStudents] = useState<any[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentPasswordConfirm, setStudentPasswordConfirm] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [parentPasswordConfirm, setParentPasswordConfirm] = useState("");
  const [relationship, setRelationship] = useState("father");
  const [result, setResult] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [editingStudentAccount, setEditingStudentAccount] = useState(false);
  const [editStudentEmail, setEditStudentEmail] = useState("");
  const [editStudentPassword, setEditStudentPassword] = useState("");
  const [editStudentPasswordConfirm, setEditStudentPasswordConfirm] = useState("");
  const [confirmDeleteStudentAccount, setConfirmDeleteStudentAccount] = useState(false);

  async function loadStudents() {
    const { data } = await supabase
      .from("student_class_enrollments")
      .select("students(id, full_name)")
      .eq("class_id", classId)
      .is("left_at", null);
    setStudents((data || []).map((r: any) => r.students).filter(Boolean));
  }

  async function loadStudentAccounts() {
    setAccountsLoading(true);
    try {
      setStudentAccounts(await callApiGet(`/api/homeroom/students/accounts?class_id=${encodeURIComponent(classId)}`));
    } catch (err: any) {
      toast.show(`Không thể tải tài khoản học sinh: ${err.message}`, "error");
    } finally {
      setAccountsLoading(false);
    }
  }

  useEffect(() => {
    setStudentId("");
    setEditingStudentAccount(false);
    loadStudents();
    loadStudentAccounts();
  }, [classId]);

  const selectedStudentAccount = studentAccounts.find((item) => item.student_id === studentId)?.account || null;

  function selectStudent(value: string) {
    setStudentId(value);
    setEditingStudentAccount(false);
    setResult("");
    setStudentEmail("");
    setStudentPassword("");
    setStudentPasswordConfirm("");
  }

  function startEditStudentAccount() {
    setEditStudentEmail(selectedStudentAccount?.email || "");
    setEditStudentPassword("");
    setEditStudentPasswordConfirm("");
    setEditingStudentAccount(true);
  }

  async function previewBulkAccounts() {
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const data = await callApi("/api/homeroom/students/accounts/bulk/preview", { class_id: classId });
      setBulkPreview(data);
      setBulkSelected(new Set(data.rows.filter((row: any) => row.is_valid).map((row: any) => row.row_index)));
    } catch (err: any) {
      setBulkPreview(null);
      setBulkSelected(new Set());
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function toggleBulkPanel() {
    if (bulkOpen) {
      setBulkOpen(false);
      return;
    }
    setBulkOpen(true);
    await previewBulkAccounts();
  }

  function toggleBulkRow(rowIndex: number) {
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex); else next.add(rowIndex);
      return next;
    });
  }

  function toggleAllValidRows() {
    const validRows = (bulkPreview?.rows || []).filter((row: any) => row.is_valid);
    const allSelected = validRows.length > 0 && validRows.every((row: any) => bulkSelected.has(row.row_index));
    setBulkSelected(allSelected ? new Set() : new Set(validRows.map((row: any) => row.row_index)));
  }

  async function confirmBulkAccounts() {
    const rows = (bulkPreview?.rows || []).filter(
      (row: any) => row.is_valid && bulkSelected.has(row.row_index)
    );
    if (!rows.length) {
      toast.show("Chưa chọn học sinh hợp lệ nào.", "error");
      return;
    }
    setBulkLoading(true);
    try {
      const data = await callApi("/api/homeroom/students/accounts/bulk/confirm", {
        class_id: classId,
        rows: rows.map((row: any) => ({
          row_index: row.row_index,
          student_id: row.student_id,
          full_name: row.full_name,
        })),
      });
      setBulkResult(data);
      setBulkSelected(new Set());
      await loadStudents();
      await loadStudentAccounts();
      toast.show(`Đã tạo ${data.created_count} tài khoản học sinh.`, data.failed_count ? "error" : "success");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function exportStudentAccounts() {
    setBulkLoading(true);
    try {
      const data = await callApi("/api/homeroom/students/accounts/export", { class_id: classId });
      if (!data.download_base64) return;
      const binary = window.atob(data.download_base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.download_filename || "danh-sach-tai-khoan-hoc-sinh.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  function downloadBulkResult() {
    if (!bulkResult?.download_base64) return;
    const binary = window.atob(bulkResult.download_base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = bulkResult.download_filename || "tai-khoan-hoc-sinh.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    if (studentPassword.length < 8 || studentPassword !== studentPasswordConfirm) {
      toast.show(studentPassword.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const res = await callApi("/api/homeroom/students/create-login", {
        student_id: studentId, class_id: classId, email: studentEmail, password: studentPassword,
      });
      setResult(`Tài khoản học sinh: ${res.email} — Mật khẩu ban đầu: ${res.temporary_password}`);
      toast.show("Đã tạo tài khoản học sinh.", "success");
      setStudentEmail("");
      setStudentPassword("");
      setStudentPasswordConfirm("");
      await loadStudentAccounts();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function updateStudentAccount(e: React.FormEvent) {
    e.preventDefault();
    if (editStudentPassword && (editStudentPassword.length < 8 || editStudentPassword !== editStudentPasswordConfirm)) {
      toast.show(editStudentPassword.length < 8 ? "Mật khẩu mới phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const updated = await callApi("/api/homeroom/students/update-login", {
        student_id: studentId,
        class_id: classId,
        email: editStudentEmail,
        password: editStudentPassword || null,
      });
      setEditingStudentAccount(false);
      setResult(`Đã cập nhật tài khoản học sinh: ${updated.email}${editStudentPassword ? " — Học sinh phải đổi mật khẩu khi đăng nhập." : ""}`);
      await loadStudentAccounts();
      toast.show("Đã cập nhật tài khoản học sinh.", "success");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function deleteStudentAccount() {
    try {
      await callApi("/api/homeroom/students/delete-login", { student_id: studentId, class_id: classId });
      setConfirmDeleteStudentAccount(false);
      setEditingStudentAccount(false);
      setResult("Đã xóa tài khoản đăng nhập của học sinh. Hồ sơ học sinh vẫn được giữ nguyên trong lớp.");
      await loadStudentAccounts();
      toast.show("Đã xóa tài khoản học sinh.", "success");
    } catch (err: any) {
      setConfirmDeleteStudentAccount(false);
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function createParentLogin(e: React.FormEvent) {
    e.preventDefault();
    if (parentPassword.length < 8 || parentPassword !== parentPasswordConfirm) {
      toast.show(parentPassword.length < 8 ? "Mật khẩu phải có ít nhất 8 ký tự." : "Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    try {
      const res = await callApi("/api/homeroom/parents/create-login", {
        student_id: studentId, class_id: classId, email: parentEmail, full_name: parentName, relationship,
        password: parentPassword,
      });
      setResult(`Tài khoản phụ huynh: ${res.email} — Mật khẩu ban đầu: ${res.temporary_password}`);
      toast.show("Đã tạo tài khoản phụ huynh.", "success");
      setParentEmail("");
      setParentName("");
      setParentPassword("");
      setParentPasswordConfirm("");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title="Tài khoản đăng nhập cho học sinh / phụ huynh" description="Học sinh không tự đăng ký — GVCN tạo hộ tài khoản.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-paper-muted p-4">
        <div>
          <p className="font-medium text-ink">Quản lý tài khoản học sinh</p>
          <p className="mt-1 text-sm text-ink-muted">Tạo mới hoặc xuất danh sách tài khoản học sinh trong lớp.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={exportStudentAccounts}
            disabled={bulkLoading}
          >
            Xuất file Excel danh sách
          </button>
          <button type="button" className="btn-primary" onClick={toggleBulkPanel} disabled={bulkLoading}>
            {bulkOpen ? "Đóng tạo hàng loạt" : "Tạo tài khoản hàng loạt"}
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="mb-6 rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Danh sách học sinh hiện tại của lớp</p>
              <p className="mt-1 text-xs text-ink-muted">Học sinh đã có tài khoản sẽ được đánh dấu và không thể chọn lại.</p>
            </div>
            <button type="button" className="btn-secondary" disabled={bulkLoading} onClick={previewBulkAccounts}>
              {bulkLoading ? "Đang tải..." : "Làm mới danh sách"}
            </button>
          </div>

          {bulkLoading && !bulkPreview && <p className="mt-5 text-sm text-ink-muted">Đang lấy danh sách học sinh...</p>}

          {bulkPreview && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink-muted">
                  Tổng {bulkPreview.total} dòng · <span className="text-add">{bulkPreview.valid_count} hợp lệ</span> · <span className="text-deduct">{bulkPreview.invalid_count} lỗi</span>
                </p>
                <button type="button" className="btn-ghost text-sm" onClick={toggleAllValidRows}>
                  Chọn tất cả / Bỏ chọn
                </button>
              </div>
              {bulkPreview.total === 0 ? <EmptyState message="Lớp chưa có học sinh. Hãy import học sinh trước khi tạo tài khoản." /> : <div className="overflow-x-auto rounded border border-border">
                <table className="data-table min-w-[900px]">
                  <thead><tr><th className="w-14">Chọn</th><th>STT</th><th>Mã HS</th><th>Họ và tên</th><th>Tên đăng nhập</th><th>Mật khẩu mặc định</th><th>Kiểm tra</th></tr></thead>
                  <tbody>
                    {bulkPreview.rows.map((row: any) => (
                      <tr key={row.row_index} className={row.is_valid ? "" : "bg-deduct-bg/40"}>
                        <td><input type="checkbox" checked={bulkSelected.has(row.row_index)} disabled={!row.is_valid || bulkLoading} onChange={() => toggleBulkRow(row.row_index)} aria-label={`Chọn dòng ${row.row_index}`} /></td>
                        <td className="text-ink-muted">{row.row_index}</td>
                        <td className="font-mono text-xs">{row.student_code || "—"}</td>
                        <td className="font-medium">{row.full_name || "—"}</td>
                        <td>{row.email || "—"}</td>
                        <td className="font-mono text-xs">{row.password || "—"}</td>
                        <td>{row.is_valid ? <span className="badge-add">Hợp lệ</span> : <span className="text-sm text-deduct">{row.errors.join("; ")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
              {bulkPreview.total > 0 && <div className="mt-4 flex justify-end">
                <button type="button" className="btn-primary" disabled={bulkLoading || bulkSelected.size === 0} onClick={confirmBulkAccounts}>
                  {bulkLoading ? "Đang tạo..." : `Tạo ${bulkSelected.size} tài khoản đã chọn`}
                </button>
              </div>}
            </div>
          )}

          {bulkResult && (
            <div className="mt-5 rounded-lg border border-gold/30 bg-gold-bg p-4">
              <p className="font-medium">Kết quả: {bulkResult.created_count} thành công, {bulkResult.failed_count} thất bại.</p>
              {bulkResult.failed?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-deduct">
                  {bulkResult.failed.map((item: any, index: number) => <li key={`${item.student_id}-${index}`}>{item.full_name || "Không xác định"}: {item.reason}</li>)}
                </ul>
              )}
              <button type="button" className="btn-secondary mt-3" onClick={downloadBulkResult}>Tải file Excel tài khoản</button>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="field-label">Chọn học sinh</label>
        <select className="field-input w-64" value={studentId} onChange={(e) => selectStudent(e.target.value)}>
          <option value="">-- Chọn --</option>
          {students.map((s) => {
            const hasAccount = Boolean(studentAccounts.find((item) => item.student_id === s.id)?.account);
            return <option key={s.id} value={s.id}>{s.full_name}{hasAccount ? " — Đã có tài khoản" : ""}</option>;
          })}
        </select>
      </div>

      {studentId && (
        <div className="mt-4 space-y-5">
          <div className="rounded-lg border border-border bg-paper-muted p-4">
            <h3 className="font-medium text-ink">Tài khoản học sinh</h3>
            {accountsLoading ? (
              <p className="mt-3 text-sm text-ink-muted">Đang kiểm tra tài khoản...</p>
            ) : selectedStudentAccount ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-add/30 bg-add-bg p-3">
                  <div>
                    <p className="font-medium text-add">Học sinh đã có tài khoản</p>
                    <p className="mt-1 text-sm text-ink"><span className="text-ink-muted">Tên đăng nhập:</span> {selectedStudentAccount.email}</p>
                    {selectedStudentAccount.created_at && <p className="mt-1 text-xs text-ink-muted">Ngày tạo: {new Date(selectedStudentAccount.created_at).toLocaleString("vi-VN")}</p>}
                    <p className="mt-1 text-xs text-ink-muted">Mật khẩu hiện tại được mã hóa nên không thể xem lại. Có thể đặt mật khẩu mới bằng nút Sửa.</p>
                    <p className="mt-1 text-xs text-ink-muted">Đăng nhập gần nhất: {selectedStudentAccount.last_sign_in_at ? new Date(selectedStudentAccount.last_sign_in_at).toLocaleString("vi-VN") : "Chưa từng đăng nhập"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" onClick={startEditStudentAccount}>Sửa</button>
                    <button type="button" className="btn-danger" onClick={() => setConfirmDeleteStudentAccount(true)}>Xóa</button>
                  </div>
                </div>

                {editingStudentAccount && (
                  <form onSubmit={updateStudentAccount} className="mt-4 flex flex-wrap items-end gap-2 rounded border border-border bg-white p-3">
                    <div>
                      <label className="field-label">Email học sinh</label>
                      <input type="email" className="field-input w-56" value={editStudentEmail} onChange={(e) => setEditStudentEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="field-label">Mật khẩu mới (không bắt buộc)</label>
                      <input type="password" className="field-input w-52" value={editStudentPassword} onChange={(e) => setEditStudentPassword(e.target.value)} minLength={8} autoComplete="new-password" />
                    </div>
                    <div>
                      <label className="field-label">Nhập lại mật khẩu mới</label>
                      <input type="password" className="field-input w-52" value={editStudentPasswordConfirm} onChange={(e) => setEditStudentPasswordConfirm(e.target.value)} minLength={8} autoComplete="new-password" />
                    </div>
                    <button type="submit" className="btn-primary">Lưu thay đổi</button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingStudentAccount(false)}>Hủy</button>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={createStudentLogin} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="field-label">Email học sinh</label>
              <input type="email" className="field-input w-52" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Mật khẩu</label>
              <input type="password" className="field-input w-44" value={studentPassword} onChange={(e) => setStudentPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Nhập lại mật khẩu</label>
              <input type="password" className="field-input w-44" value={studentPasswordConfirm} onChange={(e) => setStudentPasswordConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <button type="submit" className="btn-secondary">Tạo tài khoản</button>
              </form>
            )}
          </div>

          <form onSubmit={createParentLogin} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-4">
            <h3 className="w-full font-medium text-ink">Tài khoản phụ huynh</h3>
            <div>
              <label className="field-label">Email phụ huynh</label>
              <input type="email" className="field-input w-52" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Họ tên phụ huynh</label>
              <input className="field-input w-44" value={parentName} onChange={(e) => setParentName(e.target.value)} required />
            </div>
            <div>
              <label className="field-label">Mật khẩu</label>
              <input type="password" className="field-input w-44" value={parentPassword} onChange={(e) => setParentPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Nhập lại mật khẩu</label>
              <input type="password" className="field-input w-44" value={parentPasswordConfirm} onChange={(e) => setParentPasswordConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
            </div>
            <div>
              <label className="field-label">Quan hệ</label>
              <select className="field-input w-36" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="father">Bố</option>
                <option value="mother">Mẹ</option>
                <option value="guardian">Người giám hộ</option>
              </select>
            </div>
            <button type="submit" className="btn-secondary">Tạo tài khoản</button>
          </form>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-gold/30 bg-gold-bg px-4 py-3 text-sm">{result}</div>
      )}

      {confirmDeleteStudentAccount && (
        <ConfirmModal
          title="Xóa tài khoản học sinh"
          description={`Xóa tài khoản đăng nhập ${selectedStudentAccount?.email || ""}? Hồ sơ và dữ liệu học sinh trong lớp vẫn được giữ lại.`}
          confirmLabel="Xóa tài khoản"
          danger={true}
          onCancel={() => setConfirmDeleteStudentAccount(false)}
          onConfirm={deleteStudentAccount}
        />
      )}
    </Section>
  );
}

// =========================================================
// TIÊU CHÍ THI ĐUA
// =========================================================
