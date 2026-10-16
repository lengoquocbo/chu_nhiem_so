"use client";

import { useEffect, useState } from "react";
import { callApiGet } from "@/lib/supabaseClient";

import { Section, EmptyState } from "@/lib/ui/Section";

export function StudentGradebook() {
  const [gradebook, setGradebook] = useState<any | null>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextSchoolYearId = schoolYearId, nextTermId = termId) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextSchoolYearId) params.set("school_year_id", nextSchoolYearId);
      if (nextTermId) params.set("term_id", nextTermId);
      const result = await callApiGet(`/api/student/gradebook${params.size ? `?${params.toString()}` : ""}`);
      setGradebook(result);
      setSchoolYearId(result.selected_school_year_id || "");
      setTermId(result.selected_term_id || "");
      setDetail(null);
    } catch (err: any) {
      setError(err.message || "Không thể tải bảng điểm cá nhân.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load("", ""); }, []);

  function scoreList(items: any[]) {
    if (!items?.length) return <span className="text-ink-faint">—</span>;
    return <div className="flex flex-wrap gap-2">{items.map((item) => (
      <button key={item.id} type="button" className="badge-neutral hover:border-navy hover:text-navy" title="Xem chi tiết điểm" onClick={() => setDetail(item)}>{item.score}</button>
    ))}</div>;
  }

  return <>
    <Section title="Bảng điểm cá nhân" description="Điểm dò bài và điểm kiểm tra 15 phút của tất cả môn học trong học kỳ đã chọn.">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div><label className="field-label">Năm học</label><select className="field-input w-48" value={schoolYearId} disabled={loading} onChange={(event) => { setSchoolYearId(event.target.value); setTermId(""); load(event.target.value, ""); }}><option value="">-- Chọn năm học --</option>{(gradebook?.school_years || []).map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
        <div><label className="field-label">Học kỳ</label><select className="field-input w-48" value={termId} disabled={loading || !gradebook?.terms?.length} onChange={(event) => { setTermId(event.target.value); load(schoolYearId, event.target.value); }}><option value="">-- Chọn học kỳ --</option>{(gradebook?.terms || []).map((term: any) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></div>
      </div>
      {error ? <p className="rounded border border-deduct/30 bg-deduct-bg px-3 py-2 text-sm text-deduct">Lỗi: {error}</p>
        : loading ? <p className="text-sm text-ink-muted">Đang tải bảng điểm...</p>
        : !gradebook?.school_years?.length ? <EmptyState message="Chưa có năm học nào trong hồ sơ học sinh." />
        : !gradebook?.terms?.length ? <EmptyState message="Năm học này chưa được cấu hình học kỳ." />
        : !gradebook?.subjects?.length ? <EmptyState message="Chưa có môn học hoặc điểm kiểm tra trong học kỳ này." />
        : <table className="data-table"><thead><tr><th>Môn học</th><th>Điểm dò bài</th><th>Điểm 15 phút</th></tr></thead><tbody>{gradebook.subjects.map((subject: any) => <tr key={subject.id}><td className="font-medium">{subject.name}</td><td>{scoreList(subject.oral_scores)}</td><td>{scoreList(subject.fifteen_minute_scores)}</td></tr>)}</tbody></table>}
    </Section>

    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setDetail(null)}><div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-xl">Chi tiết điểm {detail.score}</h3><p className="mt-1 text-sm text-ink-muted">{detail.subjects?.name || "Môn học"} · {detail.assessment_type === "oral" ? "Dò bài" : "Kiểm tra 15 phút"}</p></div><button type="button" className="btn-ghost" aria-label="Đóng" onClick={() => setDetail(null)}>Đóng</button></div><dl className="mt-5 grid gap-4 rounded-lg border border-line bg-paper p-4 sm:grid-cols-2"><div><dt className="text-xs text-ink-muted">Ngày kiểm tra</dt><dd className="mt-1">{new Date(`${detail.assessment_date}T00:00:00`).toLocaleDateString("vi-VN")}</dd></div><div><dt className="text-xs text-ink-muted">Tiết học</dt><dd className="mt-1">{detail.period ? `Tiết ${detail.period}` : "—"}</dd></div><div><dt className="text-xs text-ink-muted">Giáo viên nhập</dt><dd className="mt-1">{detail.profiles?.full_name || "—"}</dd></div><div><dt className="text-xs text-ink-muted">Lớp</dt><dd className="mt-1">{detail.classes?.name || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Nhận xét</dt><dd className="mt-1">{detail.comment || "—"}</dd></div></dl></div></div>}
  </>;
}
