"use client";

import { useEffect, useMemo, useState } from "react";
import { API_ACTIVITY_EVENT, clearCurrentAccessCache, getCurrentAccess, supabase } from "@/lib/supabaseClient";

export type MenuIcon = "users" | "calendar" | "layers" | "school" | "upload" | "settings" | "groups" | "shield" | "check" | "clipboard" | "link" | "chart";

export type AppMenuItem = {
  id: string;
  label: string;
  description?: string;
  icon?: MenuIcon;
  roles?: string[];
  group?: string;
  badgeCount?: number;
};

const WORKSPACES = [
  { href: "/admin", label: "Quản trị", roles: ["principal"] },
  { href: "/homeroom", label: "Chủ nhiệm", roles: ["homeroom_teacher", "principal"] },
  { href: "/teacher", label: "Giảng dạy", roles: ["subject_teacher", "principal"] },
  { href: "/student", label: "Học sinh", roles: ["student"] },
  { href: "/parent", label: "Phụ huynh", roles: ["parent"] },
];

const ROLE_LABELS: Record<string, string> = {
  principal: "Hiệu trưởng / Admin",
  homeroom_teacher: "Giáo viên chủ nhiệm",
  subject_teacher: "Giáo viên bộ môn",
  student: "Học sinh",
  parent: "Phụ huynh",
};
const ROLE_PRIORITY = ["principal", "homeroom_teacher", "subject_teacher", "student", "parent"];

function MenuGlyph({ icon = "clipboard" }: { icon?: MenuIcon }) {
  const paths: Record<MenuIcon, React.ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    school: <><path d="m3 10 9-6 9 6"/><path d="M5 9v10h14V9M9 19v-6h6v6"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.68.6 1 .3.28.68.42 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></>,
    groups: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-1a5 5 0 0 1 10 0v1M12 20v-1a5 5 0 0 1 10 0v1"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    check: <><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h11"/></>,
    clipboard: <><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 4V2h6v2M8 10h8M8 14h8M8 18h5"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.15-1.15"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>;
}

export function AppShell({ title, subtitle, currentPath, menuItems = [], activeItem, onMenuSelect, children }: {
  title: string;
  subtitle?: string;
  currentPath: string;
  menuItems?: AppMenuItem[];
  activeItem?: string;
  onMenuSelect?: (id: string) => void;
  children: React.ReactNode;
}) {
  const [email, setEmail] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiActivity, setApiActivity] = useState({ pending: 0, mutations: 0 });

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("school-sidebar-collapsed") === "true");
    (async () => {
      const { user, roles: loadedRoles } = await getCurrentAccess();
      setEmail(user?.email ?? null);
      if (!user) { setRoles([]); return; }
      setRoles(loadedRoles);
    })();
  }, []);

  useEffect(() => {
    const update = (event: Event) => setApiActivity((event as CustomEvent<{ pending: number; mutations: number }>).detail);
    window.addEventListener(API_ACTIVITY_EVENT, update);
    return () => window.removeEventListener(API_ACTIVITY_EVENT, update);
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      window.localStorage.setItem("school-sidebar-collapsed", String(!value));
      return !value;
    });
  }

  async function handleLogout() {
    clearCurrentAccessCache();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const visibleMenu = useMemo(() => roles === null ? [] : menuItems.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role))), [menuItems, roles]);
  const menuGroups = useMemo(() => {
    const groups = new Map<string, AppMenuItem[]>();
    visibleMenu.forEach((item) => {
      const group = item.group || "Chức năng";
      groups.set(group, [...(groups.get(group) || []), item]);
    });
    return Array.from(groups.entries());
  }, [visibleMenu]);
  const visibleWorkspaces = roles === null ? [] : WORKSPACES.filter((item) => item.roles.some((role) => roles.includes(role)));
  const primaryRole = ROLE_PRIORITY.find((role) => roles?.includes(role));

  const sidebar = (
    <aside className={`flex h-full w-72 flex-col border-r border-white/10 bg-navy text-white transition-[width] duration-200 ${collapsed ? "lg:w-20" : "lg:w-72"}`}>
      <div className="flex h-20 items-center border-b border-white/10 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 font-serif text-lg">SĐ</div>
        <div className={`ml-3 min-w-0 ${collapsed ? "lg:hidden" : ""}`}><div className="font-serif text-lg leading-tight">Sổ điểm</div><div className="mt-0.5 truncate text-[11px] text-white/50">Quản lý lớp học &amp; thi đua</div></div>
        <button type="button" onClick={() => setMobileOpen(false)} className="ml-auto rounded p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Đóng menu">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <nav aria-label="Chức năng chính">
          {roles === null && <div className="mx-2 h-20 animate-pulse rounded-lg bg-white/5" />}
          {menuGroups.map(([group, items], groupIndex) => (
            <div key={group} className={groupIndex > 0 ? "mt-6 border-t border-white/10 pt-5" : undefined}>
              <div className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 ${collapsed ? "lg:hidden" : ""}`}>{group}</div>
              <div className="space-y-1">
                {items.map((item) => {
                  const selected = activeItem === item.id;
                  return <button key={item.id} type="button" title={collapsed ? item.label : undefined} onClick={() => { onMenuSelect?.(item.id); setMobileOpen(false); }} className={`group relative flex w-full items-center rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? "bg-white text-navy shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"}`} aria-current={selected ? "page" : undefined}>
                    {selected && <span className="absolute -left-1 top-2.5 h-5 w-1 rounded-full bg-gold" />}
                    <MenuGlyph icon={item.icon} />
                    <span className={`ml-3 min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}><span className={`block truncate text-sm ${item.badgeCount ? "font-bold" : "font-medium"}`}>{item.label}</span>{item.description && <span className={`mt-0.5 block truncate text-[11px] ${selected ? "text-ink-muted" : "text-white/40"}`}>{item.description}</span>}</span>
                    {!!item.badgeCount && <span className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${selected ? "bg-navy text-white" : "bg-gold text-navy"} ${collapsed ? "lg:absolute lg:right-1 lg:top-1" : ""}`}>{item.badgeCount > 99 ? "99+" : item.badgeCount}</span>}
                  </button>;
                })}
              </div>
            </div>
          ))}
        </nav>

        {visibleWorkspaces.length > 1 && <div className="mt-7 border-t border-white/10 pt-5">
          <div className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 ${collapsed ? "lg:hidden" : ""}`}>Không gian làm việc</div>
          <div className="space-y-1">{visibleWorkspaces.map((item) => <a key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${currentPath === item.href ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}><span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">{currentPath === item.href ? "●" : "○"}</span><span className={`ml-3 ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span></a>)}</div>
        </div>}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className={`rounded-lg bg-white/5 ${collapsed ? "lg:p-2" : ""} p-3`}>
          <div className="flex items-center"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-navy">{email?.slice(0, 2).toUpperCase() || "TK"}</div><div className={`ml-3 min-w-0 ${collapsed ? "lg:hidden" : ""}`}><div className="truncate text-xs font-medium">{email}</div><div className="mt-0.5 truncate text-[10px] text-white/45">{primaryRole ? ROLE_LABELS[primaryRole] : "Đang tải quyền..."}</div></div></div>
          <button type="button" onClick={handleLogout} title={collapsed ? "Đăng xuất" : undefined} className={`mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-white/55 hover:bg-white/10 hover:text-white ${collapsed ? "lg:px-0 lg:text-center" : ""}`}><span className={collapsed ? "lg:hidden" : ""}>Đăng xuất</span>{collapsed && <span className="hidden lg:inline">↪</span>}</button>
        </div>
        <button type="button" onClick={toggleCollapsed} className="mt-2 hidden w-full rounded-md py-2 text-xs text-white/45 hover:bg-white/5 hover:text-white lg:block" aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}>{collapsed ? "→" : "←  Thu gọn"}</button>
      </div>
    </aside>
  );

  return <div className="min-h-screen bg-paper lg:flex">
    {apiActivity.pending > 0 && <div className="fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-navy/10" aria-hidden="true"><div className="h-full w-1/3 animate-pulse bg-gold" /></div>}
    {apiActivity.mutations > 0 && <div className="fixed right-4 top-4 z-[101] flex items-center gap-2 rounded-full bg-navy px-3 py-2 text-xs font-medium text-white shadow-lg"><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />Đang xử lý...</div>}
    {mobileOpen && <button className="fixed inset-0 z-40 bg-navy/45 backdrop-blur-[1px] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" />}
    <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{sidebar}</div>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex min-h-20 items-center border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button type="button" onClick={() => setMobileOpen(true)} className="mr-3 rounded-lg border border-line p-2 text-navy hover:bg-paper lg:hidden" aria-label="Mở menu"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
        <div className="min-w-0"><h1 className="truncate font-serif text-xl text-ink sm:text-2xl">{title}</h1>{subtitle && <p className="mt-0.5 hidden truncate text-xs text-ink-muted sm:block">{subtitle}</p>}</div>
        {primaryRole && <span className="ml-auto hidden rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-muted sm:inline-flex">{ROLE_LABELS[primaryRole]}</span>}
      </header>
      <main className="p-3 sm:p-6 lg:p-8" aria-busy={apiActivity.mutations > 0}><div className="mx-auto min-h-[calc(100vh-8rem)] max-w-7xl overflow-hidden rounded-xl border border-line bg-white shadow-card"><div className={`overflow-x-auto p-4 sm:p-6 lg:p-8 ${apiActivity.mutations > 0 ? "pointer-events-none cursor-wait select-none" : ""}`}>{children}</div></div></main>
    </div>
  </div>;
}
