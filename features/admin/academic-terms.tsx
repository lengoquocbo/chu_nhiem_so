"use client";

import { Section, EmptyState } from "@/lib/ui/Section";
import type { AdminModel } from "./model";

export function AcademicTermsSection({ model }: { model: AdminModel }) {
  const { termYearId, setTermYearId, termName, setTermName, termNumber, setTermNumber, termStart, setTermStart, termEnd, setTermEnd, years, terms, createTerm, activateTerm } = model;
  return (
    <Section title="Học kỳ" description="Tạo các học kỳ nằm trong phạm vi ngày của năm học tương ứng.">
        <form onSubmit={createTerm} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Năm học</label>
            <select className="field-input w-44" value={termYearId} onChange={(e) => setTermYearId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Học kỳ số</label>
            <select className="field-input w-32" value={termNumber} onChange={(e) => { const number = Number(e.target.value); setTermNumber(number); setTermName(`Học kỳ ${number}`); }}>
              <option value={1}>Học kỳ 1</option>
              <option value={2}>Học kỳ 2</option>
              <option value={3}>Học kỳ 3</option>
            </select>
          </div>
          <div>
            <label className="field-label">Tên hiển thị</label>
            <input className="field-input w-40" value={termName} onChange={(e) => setTermName(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Bắt đầu</label>
            <input type="date" className="field-input" value={termStart} onChange={(e) => setTermStart(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Kết thúc</label>
            <input type="date" className="field-input" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary">Tạo học kỳ</button>
        </form>

        {terms.length === 0 ? <EmptyState message="Chưa có học kỳ nào." /> : (
          <table className="data-table mt-5">
            <thead><tr><th>Học kỳ</th><th>Năm học</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{terms.map((term) => (
              <tr key={term.id}>
                <td className="font-medium">{term.name}</td>
                <td>{years.find((year) => year.id === term.school_year_id)?.name || "—"}</td>
                <td className="text-ink-muted">{new Date(term.start_date).toLocaleDateString("vi-VN")} – {new Date(term.end_date).toLocaleDateString("vi-VN")}</td>
                <td><span className={term.status === "active" ? "badge-add" : "badge-neutral"}>{term.status === "active" ? "Đang hoạt động" : term.status}</span></td>
                <td>{term.status !== "active" && <button className="btn-ghost" onClick={() => activateTerm(term.id)}>Kích hoạt</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
  );
}
