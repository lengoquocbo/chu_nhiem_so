"use client";

import { useEffect, useState } from "react";
import { callApiGet, supabase } from "@/lib/supabaseClient";
import { RoleGuardMessage, useRoleGuard } from "@/lib/useRoleGuard";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ScoreStamp } from "@/lib/ui/ScoreStamp";

const PARENT_MENU: AppMenuItem[] = [
  { id: "current", label: "Điểm hiện tại", description: "Kết quả tuần gần nhất", icon: "chart", roles: ["parent"] },
  { id: "events", label: "Sự việc gần đây", description: "Theo dõi cộng trừ điểm", icon: "clipboard", roles: ["parent"] },
];

export default function ParentPage() {
  const guard = useRoleGuard(["parent"]);
  const [activeSection, setActiveSection] = useState("current");
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;
  const selected = PARENT_MENU.find((item) => item.id === activeSection) || PARENT_MENU[0];
  return <AppShell title={selected.label} subtitle="Theo dõi kết quả của học sinh" currentPath="/parent" menuItems={PARENT_MENU} activeItem={activeSection} onMenuSelect={setActiveSection}><ParentContent activeSection={activeSection} /></AppShell>;
}

function ParentContent({ activeSection }: { activeSection: string }) {
  const [children, setChildren] = useState<any[]>([]);
  const [studentId, setStudentId] = useState("");
  const [history, setHistory] = useState<any>(null);
  const [loadedChildren, setLoadedChildren] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("parent_student_scope")
        .select("student_id, students(id, full_name, student_code)")
        .eq("parent_id", user.id);
      const list = (data || []).map((r: any) => r.students).filter(Boolean);
      setChildren(list);
      if (list[0]) setStudentId(list[0].id);
      setLoadedChildren(true);
    })();
  }, []);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      setHistory(null);
      setError("");
      try {
        setHistory(await callApiGet(`/api/reports/student/${studentId}`));
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, [studentId]);

  return (
    <>
      {!loadedChildren ? (
        <p className="text-sm text-ink-muted">Đang tải...</p>
      ) : children.length === 0 ? (
        <EmptyState message="Chưa liên kết với hồ sơ học sinh nào. Liên hệ GVCN để được hỗ trợ." />
      ) : (
        <>
          {children.length > 1 && (
            <div className="mb-8 flex items-center gap-3">
              <label className="field-label mb-0">Chọn con</label>
              <select className="field-input w-56" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {children.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.student_code})</option>)}
              </select>
            </div>
          )}

          {!history && !error && <p className="text-sm text-ink-muted">Đang tải...</p>}
          {error && <p className="text-sm text-deduct">Lỗi: {error}</p>}

          {history && (
            <>
              {activeSection === "current" && <Section title="Điểm hiện tại">
                {history.weekly_summary[0] ? (
                  <ScoreStamp
                    score={history.weekly_summary[0].final_score}
                    rankLabel={history.weekly_summary[0].rank_label}
                    totalAdd={history.weekly_summary[0].total_add}
                    totalDeduct={history.weekly_summary[0].total_deduct}
                  />
                ) : (
                  <EmptyState message="Chưa có dữ liệu điểm tuần nào." />
                )}
              </Section>}

              {activeSection === "events" && <Section title="Sự việc gần đây">
                {history.recent_transactions.length === 0 ? (
                  <EmptyState message="Chưa có sự việc nào được ghi nhận." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Ngày</th><th>Tiêu chí</th><th>Điểm</th></tr></thead>
                    <tbody>
                      {history.recent_transactions.map((t: any) => {
                        const points = t.adjusted_points ?? t.system_points;
                        return (
                          <tr key={t.id}>
                            <td className="text-ink-muted">{new Date(t.created_at).toLocaleDateString("vi-VN")}</td>
                            <td>{t.criteria_name_snapshot}</td>
                            <td><span className={points >= 0 ? "badge-add" : "badge-deduct"}>{points >= 0 ? "+" : ""}{points}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Section>}
            </>
          )}
        </>
      )}
    </>
  );
}
