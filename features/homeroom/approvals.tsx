"use client";

import { useEffect, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

import { ConfirmModal } from "@/lib/ui/Modal";

import type { ToastApi } from "./types";

export function PendingApprovals({ classId, academicTermId, toast }: { classId: string; academicTermId: string; toast: ToastApi }) {
  const [list, setList] = useState<any[]>([]);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; points: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("score_transactions")
      .select("*, students(full_name), competition_weeks!inner(academic_term_id)")
      .eq("class_id", classId)
      .eq("competition_weeks.academic_term_id", academicTermId)
      .in("status", ["DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW"])
      .order("created_at", { ascending: false });
    setList(data || []);
  }
  useEffect(() => { load(); }, [classId, academicTermId]);

  async function approve(txId: string) {
    try {
      await callApi("/api/score/approve", { transaction_id: txId, class_id: classId });
      toast.show("Đã duyệt.", "success");
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function approveAll() {
    if (!list.length || processing) return;
    setProcessing(true);
    let approved = 0;
    let failed = 0;
    try {
      for (const transaction of list) {
        try {
          await callApi("/api/score/approve", { transaction_id: transaction.id, class_id: classId });
          approved += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) toast.show(`Đã duyệt tất cả ${approved} điểm đang chờ.`, "success");
      else toast.show(`Đã duyệt ${approved} điểm, ${failed} điểm chưa thể duyệt.`, "error");
      await load();
    } finally {
      setProcessing(false);
    }
  }

  async function adjust(txId: string, adjustedPoints: string, reason: string) {
    if (!reason.trim()) {
      toast.show("Phải nhập lý do điều chỉnh.", "error");
      return;
    }
    try {
      await callApi("/api/score/adjust", { transaction_id: txId, class_id: classId, adjusted_points: Number(adjustedPoints), reason });
      toast.show("Đã điều chỉnh.", "success");
      setAdjustTarget(null);
      load();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return (
    <Section title={`Duyệt điểm đang chờ (${list.length})`}>
      {list.length === 0 ? (
        <EmptyState message="Không có điểm nào đang chờ duyệt." />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="btn-primary" disabled={processing} onClick={approveAll}>
              {processing ? "Đang duyệt tất cả..." : `Duyệt tất cả (${list.length})`}
            </button>
          </div>
          <table className="data-table">
            <thead><tr><th>Học sinh</th><th>Tiêu chí</th><th>Điểm hệ thống</th><th></th></tr></thead>
            <tbody>
              {list.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-medium">{tx.students?.full_name}</td>
                  <td className="text-ink-muted">{tx.criteria_code_snapshot} · {tx.criteria_name_snapshot}</td>
                  <td>
                    <span className={tx.system_points >= 0 ? "badge-add" : "badge-deduct"}>
                      {tx.system_points >= 0 ? "+" : ""}{tx.system_points}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-secondary" disabled={processing} onClick={() => approve(tx.id)}>Duyệt</button>{" "}
                    <button className="btn-ghost" disabled={processing} onClick={() => setAdjustTarget({ id: tx.id, points: tx.system_points })}>Điều chỉnh</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {adjustTarget && (
        <ConfirmModal
          title="Điều chỉnh điểm"
          description="Điểm hệ thống tính có thể sai lệch thực tế — nhập lý do để lưu vào lịch sử."
          fields={[
            { key: "adjusted_points", label: "Điểm điều chỉnh", type: "number", defaultValue: adjustTarget.points, required: true },
            { key: "reason", label: "Lý do điều chỉnh", required: true },
          ]}
          confirmLabel="Lưu điều chỉnh"
          onCancel={() => setAdjustTarget(null)}
          onConfirm={(values) => adjust(adjustTarget.id, values.adjusted_points, values.reason)}
        />
      )}
    </Section>
  );
}
