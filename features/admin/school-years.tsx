"use client";

import { Section, EmptyState } from "@/lib/ui/Section";
import type { AdminModel } from "./model";

export function SchoolYearsSection({ model }: { model: AdminModel }) {
  const { yearName, setYearName, yearStart, setYearStart, yearEnd, setYearEnd, years, createYear, activateYear } = model;
  return (
    <Section title="Năm học">
        <form onSubmit={createYear} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Tên năm học</label>
            <input className="field-input w-40" value={yearName} onChange={(e) => setYearName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Bắt đầu</label>
            <input type="date" className="field-input" value={yearStart} onChange={(e) => setYearStart(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Kết thúc</label>
            <input type="date" className="field-input" value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">Tạo năm học</button>
        </form>

        {years.length === 0 ? (
          <EmptyState message="Chưa có năm học nào." />
        ) : (
          <table className="data-table mt-5">
            <tbody>
              {years.map((y) => (
                <tr key={y.id}>
                  <td className="font-medium">{y.name}</td>
                  <td>
                    <span className={y.status === "active" ? "badge-add" : "badge-neutral"}>
                      {y.status === "active" ? "Đang hoạt động" : y.status}
                    </span>
                  </td>
                  <td>
                    {y.status !== "active" && (
                      <button className="btn-ghost" onClick={() => activateYear(y.id)}>Kích hoạt</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
  );
}
