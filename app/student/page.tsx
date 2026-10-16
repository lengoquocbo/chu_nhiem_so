"use client";

import { useEffect, useState } from "react";
import { callApi, callApiGet, supabase } from "@/lib/supabaseClient";
import { RoleGuardMessage, useRoleGuard } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ScoreStamp } from "@/lib/ui/ScoreStamp";
import { ClassCommunications } from "@/lib/ui/ClassCommunications";
import { FirstLoginPasswordChange } from "@/features/student/first-login";
import { StudentContent } from "@/features/student/content";

const STUDENT_MENU: AppMenuItem[] = [
  { id: "forum", label: "Diễn đàn thông báo", description: "Thông tin mới của lớp", icon: "clipboard", roles: ["student"] },
  { id: "feedback", label: "Góp ý – phản hồi", description: "Gửi góp ý ẩn danh", icon: "users", roles: ["student"] },
  { id: "current", label: "Điểm hiện tại", description: "Kết quả tuần gần nhất", icon: "chart", roles: ["student"] },
  { id: "gradebook", label: "Bảng điểm cá nhân", description: "Điểm các môn học", icon: "clipboard", roles: ["student"] },
  { id: "weeks", label: "Lịch sử theo tuần", description: "Điểm và xếp loại", icon: "calendar", roles: ["student"] },
];

const OFFICER_MENU: AppMenuItem = { id: "class-management", label: "Quản lý lớp", description: "Chức năng ban cán sự", icon: "users", roles: ["student"] };

export default function StudentPage() {
  const guard = useRoleGuard(["student"]);
  const [activeSection, setActiveSection] = useState("current");
  const [passwordGate, setPasswordGate] = useState<"loading" | "required" | "ready" | "error">("loading");
  const [gateError, setGateError] = useState("");
  const [officerAccess, setOfficerAccess] = useState<any>({ classes: [] });
  const [communicationUnread, setCommunicationUnread] = useState({ forum: 0, feedback: 0 });

  async function loadCommunicationUnread() {
    try { setCommunicationUnread(await callApiGet("/api/communications/unread")); }
    catch { setCommunicationUnread({ forum: 0, feedback: 0 }); }
  }

  useEffect(() => {
    if (guard !== "allowed") return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) {
        setGateError(error?.message || "Không tìm thấy hồ sơ tài khoản.");
        setPasswordGate("error");
        return;
      }
      setPasswordGate(data.must_change_password ? "required" : "ready");
    })();
  }, [guard]);

  useEffect(() => {
    if (guard !== "allowed" || passwordGate !== "ready") return;
    callApiGet("/api/officers/me").then(setOfficerAccess).catch(() => setOfficerAccess({ classes: [] }));
    loadCommunicationUnread();
    const timer = window.setInterval(loadCommunicationUnread, 30000);
    return () => window.clearInterval(timer);
  }, [guard, passwordGate]);

  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;
  if (passwordGate === "loading") return <main className="grid min-h-screen place-items-center bg-paper-muted"><p className="text-ink-muted">Đang kiểm tra tài khoản...</p></main>;
  if (passwordGate === "error") return <main className="grid min-h-screen place-items-center bg-paper-muted p-6"><div className="max-w-lg rounded-lg border border-deduct/30 bg-white p-6 text-deduct">Không thể kiểm tra yêu cầu đổi mật khẩu: {gateError}</div></main>;
  if (passwordGate === "required") return <FirstLoginPasswordChange />;
  const baseMenu = STUDENT_MENU.map((item) => item.id === "forum" ? { ...item, badgeCount: communicationUnread.forum } : item.id === "feedback" ? { ...item, badgeCount: communicationUnread.feedback } : item);
  const menuItems = officerAccess.classes?.some((item: any) => item.permissions?.length) ? [...baseMenu, OFFICER_MENU] : baseMenu;
  const selected = menuItems.find((item) => item.id === activeSection) || menuItems[0];
  return <AppShell title={selected.label} subtitle="Theo dõi kết quả thi đua cá nhân" currentPath="/student" menuItems={menuItems} activeItem={activeSection} onMenuSelect={setActiveSection}><StudentContent activeSection={activeSection} officerAccess={officerAccess} onUnreadChange={loadCommunicationUnread} /></AppShell>;
}
