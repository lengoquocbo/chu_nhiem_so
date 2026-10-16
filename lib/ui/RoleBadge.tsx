"use client";

/** Nhãn tiếng Việt cho các vai trò trong bảng user_roles. */
export const ROLE_LABELS: Record<string, string> = {
  system_admin: "Quản trị hệ thống",
  principal: "Hiệu trưởng",
  homeroom_teacher: "GVCN",
  subject_teacher: "GVBM",
  student: "Học sinh",
  parent: "Phụ huynh",
};

const ROLE_BADGES: Record<string, string> = {
  system_admin: "badge-gold",
  principal: "badge-gold",
};

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}

/** Danh sách vai trò của một tài khoản (một người có thể vừa GVCN vừa GVBM). */
export function RoleBadges({ roles }: { roles: string[] }) {
  if (!roles || roles.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span key={role} className={ROLE_BADGES[role] ?? "badge-neutral"}>
          {roleLabel(role)}
        </span>
      ))}
    </span>
  );
}
