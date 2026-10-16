"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";
import { Section } from "@/lib/ui/Section";
import { useToast } from "@/lib/ui/Toast";
import { TeacherAccountsPanel } from "./staff-accounts";
import type { ClassRow, StudentItem, CreatedAccount } from "./types";

const ROLE_OPTIONS = [
  { value: "homeroom_teacher", label: "Giáo viên chủ nhiệm (GVCN)" },
  { value: "subject_teacher", label: "Giáo viên bộ môn (GVBM)" },
  { value: "student", label: "Học sinh" },
  { value: "parent", label: "Phụ huynh" },
];


export function CreateAccountForm({ classes, onCreated }: { classes: ClassRow[]; onCreated: () => Promise<void> }) {
  const toast = useToast();

  // --- Chung ---
  const [role, setRole] = useState("homeroom_teacher");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreatedAccount | null>(null);

  // --- Học sinh / Phụ huynh: chọn lớp → load HS ---
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // --- Phụ huynh ---
  const [relationship, setRelationship] = useState("guardian");

  const isTeacher = role === "homeroom_teacher" || role === "subject_teacher";
  const isStudent = role === "student";
  const isParent = role === "parent";
  const needsClass = isStudent || isParent;

  // Reset state khi đổi role
  function handleRoleChange(newRole: string) {
    setRole(newRole);
    setEmail("");
    setFullName("");
    setPassword("");
    setConfirmPassword("");
    setResult(null);
    setSelectedClassId("");
    setStudents([]);
    setSelectedStudentId("");
    setRelationship("guardian");
  }

  // Load học sinh khi chọn lớp
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setSelectedStudentId("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("student_class_enrollments")
        .select("student_id, students(id, full_name)")
        .eq("class_id", selectedClassId)
        .is("left_at", null);
      if (error) {
        setStudents([]);
        setSelectedStudentId("");
        toast.show(`Không tải được danh sách học sinh: ${error.message}`, "error");
        return;
      }
      const list = ((data || []) as any[])
        .map((r) => r.students)
        .filter(Boolean)
        .map((s: any) => ({ id: s.id, full_name: s.full_name }));
      setStudents(list);
      setSelectedStudentId("");
    })();
  }, [selectedClassId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.show("Mật khẩu phải có ít nhất 8 ký tự.", "error");
      return;
    }
    if (password !== confirmPassword) {
      toast.show("Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      let res: CreatedAccount;
      if (isTeacher) {
        res = await callApi("/api/admin/teachers", {
          email,
          full_name: fullName,
          role,
          password,
        });
        toast.show(`Đã tạo tài khoản giáo viên cho ${fullName}.`, "success");
      } else if (isStudent) {
        res = await callApi("/api/admin/students/create-login", {
          student_id: selectedStudentId,
          email,
          password,
        });
        toast.show("Đã tạo tài khoản học sinh.", "success");
      } else if (isParent) {
        res = await callApi("/api/admin/parents/create-login", {
          student_id: selectedStudentId,
          email,
          full_name: fullName,
          relationship,
          password,
        });
        toast.show(`Đã tạo tài khoản phụ huynh cho ${fullName}.`, "success");
      } else {
        throw new Error("Vai trò tài khoản không hợp lệ.");
      }
      setResult(res);
      await onCreated();
      // Reset form (giữ nguyên role)
      setEmail("");
      setFullName("");
      setPassword("");
      setConfirmPassword("");
      setSelectedStudentId("");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Chọn role */}
      <div className="mb-5">
        <label className="field-label">Vai trò cần tạo tài khoản</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleRoleChange(opt.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                role === opt.value
                  ? "border-navy bg-navy text-white"
                  : "border-line bg-white text-ink hover:border-navy/50 hover:text-navy"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        {/* ---- GIÁO VIÊN ---- */}
        {isTeacher && (
          <>
            <div>
              <label className="field-label">Họ tên</label>
              <input
                className="field-input w-48"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Nguyễn Thị B"
              />
            </div>
            <div>
              <label className="field-label">Email đăng nhập</label>
              <input
                type="email"
                className="field-input w-56"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="giaovien@truong.edu.vn"
              />
            </div>
          </>
        )}

        {/* ---- HỌC SINH / PHỤ HUYNH: chọn lớp + học sinh ---- */}
        {needsClass && (
          <>
            <div>
              <label className="field-label">Lớp</label>
              <select
                className="field-input w-40"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                required
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">{isParent ? "Học sinh liên kết" : "Học sinh"}</label>
              <select
                className="field-input w-56"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
                disabled={!selectedClassId}
              >
                <option value="">-- Chọn học sinh --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ---- PHỤ HUYNH: thêm tên + quan hệ ---- */}
        {isParent && (
          <>
            <div>
              <label className="field-label">Họ tên phụ huynh</label>
              <input
                className="field-input w-48"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="field-label">Quan hệ</label>
              <select className="field-input w-36" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="father">Bố</option>
                <option value="mother">Mẹ</option>
                <option value="guardian">Người giám hộ</option>
              </select>
            </div>
          </>
        )}

        {/* ---- EMAIL (học sinh + phụ huynh) ---- */}
        {needsClass && (
          <div>
            <label className="field-label">Email đăng nhập</label>
            <input
              type="email"
              className="field-input w-56"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={isStudent ? "hocsinh@email.com" : "phuhuynh@email.com"}
            />
          </div>
        )}

        <div>
          <label className="field-label">Mật khẩu</label>
          <input
            type="password"
            className="field-input w-48"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
          />
        </div>
        <div>
          <label className="field-label">Xác nhận mật khẩu</label>
          <input
            type="password"
            className="field-input w-48"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
      </form>

      {/* Cảnh báo khi lớp chưa có học sinh */}
      {needsClass && students.length === 0 && selectedClassId && (
        <p className="mt-3 text-sm text-ink-muted">
          Lớp này chưa có học sinh. Hãy import danh sách học sinh trước.
        </p>
      )}

      {/* Kết quả */}
      {result && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm">
          <div className="font-medium text-green-800">✓ Tạo tài khoản thành công</div>
          <div className="mt-1">
            Email: <span className="font-medium">{result.email}</span>
          </div>
          <div className="mt-0.5">
            Mật khẩu ban đầu:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm border border-green-200">
              {result.temporary_password}
            </code>
          </div>
          <div className="mt-1.5 text-green-700">
            Gửi thông tin này cho người dùng và yêu cầu đổi mật khẩu ngay khi đăng nhập lần đầu.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Khối "Tài khoản" của trang quản trị trường: form tạo tài khoản + danh sách
 * tài khoản giáo viên của trường. Tạo giáo viên xong thì danh sách tự nạp lại.
 */
export function AccountsWorkspace({ classes, onChanged }: { classes: ClassRow[]; onChanged: () => Promise<void> }) {
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleCreated() {
    await onChanged();
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <Section
        title="Tạo tài khoản người dùng"
        description="Hiệu trưởng tạo tài khoản giáo viên, học sinh hoặc phụ huynh trong trường. Admin cấp hệ thống tạo tài khoản hiệu trưởng ở không gian quản trị hệ thống."
      >
        <CreateAccountForm classes={classes} onCreated={handleCreated} />
      </Section>
      <Section
        title="Tài khoản giáo viên trong trường"
        description="Tài khoản GVCN/GVBM thuộc trường đang quản trị. Có thể đổi mật khẩu, thu hồi quyền truy cập hoặc xóa tài khoản."
      >
        <TeacherAccountsPanel refreshKey={refreshKey} onChanged={onChanged} />
      </Section>
    </>
  );
}
