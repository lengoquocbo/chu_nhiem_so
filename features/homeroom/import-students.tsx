"use client";

import { useEffect, useState } from "react";
import { supabase, callApi, apiUrl } from "@/lib/supabaseClient";

import { Section } from "@/lib/ui/Section";

import type { Option, ToastApi } from "./types";

export function ImportStudents({ classId, toast }: { classId: string; toast: ToastApi }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [years, setYears] = useState<Option[]>([]);

  useEffect(() => {
    supabase.from("classes").select("school_year_id, school_years(id, name)").eq("id", classId).maybeSingle()
      .then(({ data }: any) => {
        const year = data?.school_years;
        setYears(year ? [year] : []);
        setSchoolYearId(data?.school_year_id || "");
      });
  }, [classId]);

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("class_id", classId);
    form.append("file", file);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(apiUrl("/api/students/import/validate"), {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) {
      toast.show(`Lỗi: ${json.detail}`, "error");
      return;
    }
    setPreview(json);
  }

  async function handleConfirm() {
    const validRows = preview.rows.filter((r: any) => r.is_valid);
    const result = await callApi("/api/students/import/confirm", {
      class_id: classId,
      school_year_id: schoolYearId,
      rows: validRows,
    });
    toast.show(`Đã import ${result.created.length} học sinh, lỗi ${result.failed.length}.`, "success");
    setPreview(null);
    setFile(null);
  }

  return (
    <Section title="Import danh sách học sinh" description="Cột bắt buộc: Họ và tên · Giới tính · Ngày tháng năm sinh · Số điện thoại phụ huynh · Email phụ huynh · Địa chỉ">
      <form onSubmit={handleValidate} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Năm học</label>
          <select className="field-input w-44" value={schoolYearId} onChange={(e) => setSchoolYearId(e.target.value)} required>
            <option value="">-- Chọn --</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">File Excel (.xlsx)</label>
          <input type="file" accept=".xlsx" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </div>
        <button type="submit" className="btn-secondary">Kiểm tra file</button>
      </form>

      {preview && (
        <div className="mt-5">
          <p className="text-sm text-ink-muted">
            Tổng {preview.total} dòng — <span className="text-add font-medium">{preview.valid_count} hợp lệ</span>,{" "}
            <span className="text-deduct font-medium">{preview.invalid_count} lỗi</span>
          </p>
          <table className="data-table mt-3 min-w-[900px]">
            <thead>
              <tr>
                <th className="w-14">STT</th>
                <th>Họ tên</th>
                <th>Giới tính</th>
                <th>Ngày sinh</th>
                <th>SĐT phụ huynh</th>
                <th>Email phụ huynh</th>
                <th>Địa chỉ</th>
                <th>Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r: any, index: number) => (
                <tr key={r.row_index} className={r.is_valid ? "" : "bg-deduct-bg/40"}>
                  <td className="text-ink-muted">{index + 1}</td>
                  <td className="font-medium">{r.full_name || "—"}</td>
                  <td>{r.gender === "male" ? "Nam" : r.gender === "female" ? "Nữ" : r.gender === "other" ? "Khác" : "—"}</td>
                  <td>{r.dob || "—"}</td>
                  <td>{r.parent_phone || "—"}</td>
                  <td>{r.parent_email || "—"}</td>
                  <td className="max-w-64 whitespace-normal">{r.address || "—"}</td>
                  <td className="text-deduct text-xs">{r.errors.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary mt-4" onClick={handleConfirm} disabled={!schoolYearId || preview.valid_count === 0}>
            Xác nhận import {preview.valid_count} học sinh hợp lệ
          </button>
        </div>
      )}
    </Section>
  );
}

// =========================================================
// QUẢN LÝ LỚP HỌC
// =========================================================
