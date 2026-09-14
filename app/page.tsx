"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ROLE_DESTINATIONS: { role: string; href: string }[] = [
  { role: "principal", href: "/admin" },
  { role: "homeroom_teacher", href: "/homeroom" },
  { role: "subject_teacher", href: "/teacher" },
  { role: "student", href: "/student" },
  { role: "parent", href: "/parent" },
];

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
const [loggingOut, setLoggingOut] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

  useEffect(() => {
    setPasswordChanged(new URLSearchParams(window.location.search).get("passwordChanged") === "1");
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setUserEmail(data.session?.user.email ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      setUserEmail(session?.user.email ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    (async () => {
      setRoleError("");
      const { data, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (cancelled) return;

      if (rolesError) {
        setRoleError(`Không thể tải quyền tài khoản: ${rolesError.message}`);
        return;
      }

      const roles = new Set((data || []).map((item: { role: string }) => item.role));
      const destination = ROLE_DESTINATIONS.find((item) => roles.has(item.role));
      if (!destination) {
        setRoleError("Tài khoản chưa được gán vai trò. Hãy liên hệ quản trị hệ thống.");
        return;
      }

      router.replace(destination.href);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, userId]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  }

async function handleLogout() {
  setLoggingOut(true);
  try {
    await supabase.auth.signOut();
  } finally {
    setLoggingOut(false);
  }
}

  if (!authReady || userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-md text-center">
          <div className="font-serif text-2xl text-ink">Sổ điểm</div>
          {!authReady ? (
            <p className="mt-3 text-sm text-ink-muted">Đang kiểm tra phiên đăng nhập...</p>
          ) : roleError ? (
            <>
              <p className="mt-3 text-sm text-deduct">{roleError}</p>
              <p className="mt-1 text-sm text-ink-muted">Tài khoản: {userEmail}</p>
              <button onClick={handleLogout} className="btn-ghost mt-5" disabled={loggingOut}>{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</button>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">Đang chuyển đến trang phù hợp với quyền của bạn...</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <div className="font-serif text-2xl">Sổ điểm</div>
        <div>
          <p className="font-serif text-3xl leading-snug">
            Nhập sự việc.
            <br />
            Hệ thống tính điểm.
            <br />
            GVCN duyệt.
          </p>
          <p className="mt-4 max-w-sm text-sm text-white/60">
            Toàn bộ điểm thi đua được tính từ sự việc thực tế và ghi lại thành lịch sử,
            không ai được sửa tổng điểm trực tiếp.
          </p>
        </div>
        <div className="text-xs text-white/40">Quản lý lớp học · Điểm danh · Thi đua</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={handleLogin} className="w-full max-w-sm">
          <h1 className="font-serif text-2xl text-ink">Đăng nhập</h1>
          <p className="mt-1 text-sm text-ink-muted">Dùng tài khoản được cấp bởi nhà trường.</p>

          {passwordChanged && (
            <p className="mt-4 rounded border border-add/30 bg-add-bg px-3 py-2 text-sm text-add">
              Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label className="field-label">Email</label>
              <input
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">Mật khẩu</label>
              <input
                type="password"
                className="field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-deduct">{error}</p>}

          <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </main>
  );
}
