"use client";

import { AccountsWorkspace } from "./accounts";
import { useAdminModel } from "./model";
import { SchoolYearsSection } from "./school-years";
import { AcademicTermsSection } from "./academic-terms";
import { GradeBlocksSection } from "./grade-blocks";
import { ClassesSection } from "./classes";

export function AdminContent({ activeSection }: { activeSection: string }) {
  const model = useAdminModel();
  return (
    <>
      {/* ========== TẠO TÀI KHOẢN + DANH SÁCH GIÁO VIÊN ========== */}
      {activeSection === "accounts" && <AccountsWorkspace classes={model.classes} onChanged={model.loadAll} />}

      {/* ========== QUẢN LÝ NĂM HỌC / KHỐI / LỚP ========== */}
      {activeSection === "years" && <SchoolYearsSection model={model} />}

      {activeSection === "terms" && <AcademicTermsSection model={model} />}

      {activeSection === "grades" && <GradeBlocksSection model={model} />}

      {activeSection === "classes" && <ClassesSection model={model} />}
    </>
  );
}
