"use client";

import { useState } from "react";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { ToastProvider } from "@/lib/ui/Toast";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";
import { AdminContent } from "@/features/admin/content";

const ADMIN_MENU: AppMenuItem[] = [
  { id: "accounts", label: "Tài khoản", description: "Tạo và phân quyền", icon: "users", roles: ["principal", "system_admin"] },
  { id: "years", label: "Năm học", description: "Kỳ học và trạng thái", icon: "calendar", roles: ["principal", "system_admin"] },
  { id: "terms", label: "Học kỳ", description: "Thời gian từng học kỳ", icon: "calendar", roles: ["principal", "system_admin"] },
  { id: "grades", label: "Khối học", description: "Cấu trúc khối", icon: "layers", roles: ["principal", "system_admin"] },
  { id: "classes", label: "Lớp học", description: "Lớp và giáo viên chủ nhiệm", icon: "school", roles: ["principal", "system_admin"] },
];

export default function AdminPage() {
  const guard = useRoleGuard(["principal", "system_admin"]);
  const [activeSection, setActiveSection] = useState("accounts");
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;

  const selected = ADMIN_MENU.find((item) => item.id === activeSection) || ADMIN_MENU[0];

  return (
    <ToastProvider>
      <AppShell
        title={selected.label}
        subtitle="Không gian quản trị trường học"
        currentPath="/admin"
        menuItems={ADMIN_MENU}
        activeItem={activeSection}
        onMenuSelect={setActiveSection}
      >
        <AdminContent activeSection={activeSection} />
      </AppShell>
    </ToastProvider>
  );
}
