"use client";

import { useEffect, useState } from "react";
import { getCurrentAccess } from "./supabaseClient";

/**
 * Kiểm tra user hiện tại có 1 trong các role cho phép không.
 * Đây CHỈ là lớp UX (ẩn/hiện form cho gọn) - lớp bảo vệ dữ liệu thật sự
 * vẫn là RLS + kiểm tra quyền trong Python backend. Không được dùng
 * kết quả hook này để tự ý bỏ qua RLS/kiểm tra phía server.
 */
export function useRoleGuard(allowedRoles: string[]) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "not_logged_in">("loading");

  useEffect(() => {
    (async () => {
      const { user, roles } = await getCurrentAccess();
      if (!user) {
        setStatus("not_logged_in");
        return;
      }
      setStatus(roles.some((r) => allowedRoles.includes(r)) ? "allowed" : "denied");
    })();
  }, []);

  return status;
}

export function RoleGuardMessage({ status }: { status: string }) {
  if (status === "not_logged_in") {
    return (
      <main style={{ padding: 24 }}>
        <p>
          Bạn chưa đăng nhập. <a href="/">Quay lại trang đăng nhập</a>.
        </p>
      </main>
    );
  }
  if (status === "denied") {
    return (
      <main style={{ padding: 24 }}>
        <p>Tài khoản của bạn không có quyền truy cập trang này.</p>
        <a href="/">Quay lại</a>
      </main>
    );
  }
  return (
    <main style={{ padding: 24 }}>
      <p>Đang kiểm tra quyền truy cập...</p>
    </main>
  );
}
