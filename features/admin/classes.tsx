"use client";

import { Section, EmptyState } from "@/lib/ui/Section";
import type { AdminModel } from "./model";

export function ClassesSection({ model }: { model: AdminModel }) {
  const { classes, classYearId, setClassYearId, classGradeId, setClassGradeId, classTermId, setClassTermId, className, setClassName, classCreating, years, terms, grades, teachers, createClass, assignHomeroom } = model;
  return (
    <Section title={`Danh sách lớp (${classes.length})`} description="Hiệu trưởng xem toàn bộ lớp và phân công Giáo viên chủ nhiệm tại đây.">
        <form onSubmit={createClass} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Năm học</label>
            <select className="field-input w-40" value={classYearId} onChange={(e) => { const yearId = e.target.value; setClassYearId(yearId); setClassGradeId(""); setClassTermId(terms.find((term) => term.school_year_id === yearId && term.status === "active")?.id || terms.find((term) => term.school_year_id === yearId)?.id || ""); }} required>
              <option value="">-- Chọn --</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Học kỳ</label>
            <select className="field-input w-40" value={classTermId} onChange={(e) => setClassTermId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {terms.filter((term) => term.school_year_id === classYearId).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Khối</label>
            <select className="field-input w-40" value={classGradeId} onChange={(e) => setClassGradeId(e.target.value)} required>
              <option value="">-- Chọn --</option>
              {grades.filter((g) => g.school_year_id === classYearId).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Tên lớp</label>
            <input className="field-input w-32" value={className} onChange={(e) => setClassName(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={classCreating || !classYearId || !classTermId || !classGradeId}>{classCreating ? "Đang tạo..." : "Tạo lớp"}</button>
        </form>

        {classes.length === 0 ? (
          <EmptyState message="Chưa có lớp nào." />
        ) : (
          <table className="data-table mt-5">
            <thead>
              <tr><th>Lớp</th><th>Mã lớp</th><th>Năm học</th><th>Học kỳ</th><th>GVCN</th></tr>
            </thead>
            <tbody>
              {classes.flatMap((c) => (c.class_academic_terms || []).map((classTerm) => {
                const activeAssignment = classTerm.homeroom_term_assignments?.find((assignment) => assignment.status === "active");
                return (
                <tr key={classTerm.id}>
                  <td className="font-medium">{c.name}</td>
                  <td><code className="rounded bg-paper px-1.5 py-0.5 text-xs">{c.class_code}</code></td>
                  <td>{years.find((year) => year.id === c.school_year_id)?.name || "—"}</td>
                  <td>{classTerm.academic_terms?.name || "—"}</td>
                  <td>
                    <select
                      className="field-input w-56"
                      value={activeAssignment?.teacher_id || ""}
                      onChange={(e) => assignHomeroom(c.id, classTerm.academic_term_id, e.target.value)}
                    >
                      <option value="">-- Chưa phân công --</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </td>
                </tr>
              ); }))}
            </tbody>
          </table>
        )}
      </Section>
  );
}
