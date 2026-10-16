"use client";

import { useState } from "react";
import { callApi, supabase } from "@/lib/supabaseClient";

export function FirstLoginPasswordChange() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ và số.");
      return;
    }
    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    try {
      await callApi("/api/student/change-password", { new_password: password });
      await supabase.auth.signOut();
      window.location.href = "/?passwordChanged=1";
    } catch (err: any) {
      setError(err.message || "Không thể đổi mật khẩu.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper-muted p-5">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg sm:p-8">
        <p className="font-serif text-3xl text-ink">Sổ điểm</p>
        <h1 className="mt-6 text-xl font-semibold text-ink">Đổi mật khẩu lần đầu</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Đây là tài khoản do giáo viên cấp. Bạn cần đặt mật khẩu mới trước khi xem dữ liệu học tập.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="field-label">Mật khẩu mới</label>
            <input type="password" className="field-input w-full" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </div>
          <div>
            <label className="field-label">Nhập lại mật khẩu mới</label>
            <input type="password" className="field-input w-full" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          </div>
          {error && <div className="rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? "Đang đổi mật khẩu..." : "Đổi mật khẩu và đăng nhập lại"}</button>
        </form>
      </div>
    </main>
  );
}
