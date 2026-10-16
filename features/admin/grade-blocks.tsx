"use client";

import { Section } from "@/lib/ui/Section";
import type { AdminModel } from "./model";

export function GradeBlocksSection({ model }: { model: AdminModel }) {
  const { gradeYearId, setGradeYearId, gradeName, setGradeName, years, grades, createGrade } = model;
  return (
    <Section title="Khối">
        <form onSubmit={createGrade} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Năm học</label>
            <select className="field-input w-48" value={gradeYearId} onChange={(e) => setGradeYearId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Tên khối</label>
            <input className="field-input w-40" value={gradeName} onChange={(e) => setGradeName(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">Tạo khối</button>
        </form>
        {grades.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {grades.map((g) => <span key={g.id} className="badge-neutral">{g.name}</span>)}
          </div>
        )}
      </Section>
  );
}
