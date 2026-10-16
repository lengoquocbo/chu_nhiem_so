import { useEffect, useRef, useState } from "react";
import { supabase, callApi, getActingSchool, getCurrentAccess } from "@/lib/supabaseClient";
import { useToast } from "@/lib/ui/Toast";
import type { SchoolYear, AcademicTerm, Grade, ClassRow, Teacher } from "./types";

export function useAdminModel() {
  const toast = useToast();
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schoolId, setSchoolId] = useState("");

  const [yearName, setYearName] = useState("2026-2027");
  const [yearStart, setYearStart] = useState("2026-09-01");
  const [yearEnd, setYearEnd] = useState("2027-05-31");

  const [termYearId, setTermYearId] = useState("");
  const [termName, setTermName] = useState("Học kỳ 1");
  const [termNumber, setTermNumber] = useState(1);
  const [termStart, setTermStart] = useState("2026-09-01");
  const [termEnd, setTermEnd] = useState("2027-01-15");

  const [gradeYearId, setGradeYearId] = useState("");
  const [gradeName, setGradeName] = useState("Khối 10");

  const [classGradeId, setClassGradeId] = useState("");
  const [classYearId, setClassYearId] = useState("");
  const [classTermId, setClassTermId] = useState("");
  const [className, setClassName] = useState("10A1");
  const [classCreating, setClassCreating] = useState(false);
  const classCreatingRef = useRef(false);

  async function loadAll() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { roles } = await getCurrentAccess();
    const actingSchool = roles.includes("system_admin") ? getActingSchool() : null;
    let selectedSchoolId = actingSchool?.id || "";
    if (!selectedSchoolId) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("staff_school_assignments").select("school_id")
        .eq("user_id", auth.user.id).maybeSingle();
      if (assignmentError || !assignment?.school_id) {
        toast.show(roles.includes("system_admin") ? "Hãy chọn trường trong Quản trị hệ thống trước." : "Tài khoản hiệu trưởng chưa được gắn với trường.", "error");
        return;
      }
      selectedSchoolId = assignment.school_id;
    }
    if (!selectedSchoolId) {
      return;
    }
    setSchoolId(selectedSchoolId);
    const [y, term, g, c, t] = await Promise.all([
      supabase.from("school_years").select("*").eq("school_id", selectedSchoolId).order("created_at", { ascending: false }),
      supabase.from("academic_terms").select("*").order("school_year_id").order("term_number"),
      supabase.from("grade_blocks").select("*").order("order_index"),
      supabase.from("classes").select("*, class_academic_terms(id,academic_term_id, academic_terms(id,school_year_id,name,term_number,start_date,end_date,status), homeroom_term_assignments(id,teacher_id,status,profiles!homeroom_term_assignments_teacher_id_fkey(id,full_name)))").order("name"),
      supabase.from("user_roles").select("user_id, profiles(id, full_name)").eq("role", "homeroom_teacher"),
    ]);
    const yearRows = y.data || [];
    setYears(yearRows);
    const termRows = term.data || [];
    setTerms(termRows);
    setTermYearId((current) => current || yearRows.find((item) => item.status === "active")?.id || yearRows[0]?.id || "");
    setGrades(g.data || []);
    setClasses(c.data || []);
    setTeachers(((t.data || []) as any[]).map((r) => r.profiles).filter(Boolean));
    const activeYearId = yearRows.find((item) => item.status === "active")?.id || yearRows[0]?.id || "";
    setClassYearId((current) => current || activeYearId);
    setClassTermId((current) => current || termRows.find((item) => item.school_year_id === activeYearId && item.status === "active")?.id || termRows.find((item) => item.school_year_id === activeYearId)?.id || "");
  }

  useEffect(() => { loadAll(); }, []);

  async function createYear(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    const { error } = await supabase.from("school_years").insert({ school_id: schoolId, name: yearName, start_date: yearStart, end_date: yearEnd });
    toast.show(error ? `Lỗi: ${error.message}` : "Đã tạo năm học.", error ? "error" : "success");
    loadAll();
  }

  async function activateYear(id: string) {
    if (!schoolId) return;
    const previousActive = years.find((year) => year.status === "active");
    const { error: closeError } = await supabase
      .from("school_years")
      .update({ status: "closed" })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .neq("id", id);
    if (closeError) {
      toast.show(`Lỗi: ${closeError.message}`, "error");
      return;
    }
    const { error } = await supabase.from("school_years").update({ status: "active" }).eq("id", id);
    if (error && previousActive) {
      await supabase.from("school_years").update({ status: "active" }).eq("id", previousActive.id);
    }
    toast.show(error ? `Lỗi: ${error.message}` : "Đã kích hoạt năm học.", error ? "error" : "success");
    loadAll();
  }

  async function createGrade(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("grade_blocks").insert({ name: gradeName, school_year_id: gradeYearId });
    toast.show(error ? `Lỗi: ${error.message}` : "Đã tạo khối.", error ? "error" : "success");
    loadAll();
  }

  async function createTerm(e: React.FormEvent) {
    e.preventDefault();
    try {
      await callApi("/api/admin/academic-terms", {
        school_year_id: termYearId,
        name: termName,
        term_number: termNumber,
        start_date: termStart,
        end_date: termEnd,
      });
      toast.show("Đã tạo học kỳ.", "success");
      await loadAll();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function activateTerm(id: string) {
    try {
      await callApi(`/api/admin/academic-terms/${id}/activate`, {});
      toast.show("Đã kích hoạt học kỳ.", "success");
      await loadAll();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    if (classCreatingRef.current) return;
    classCreatingRef.current = true;
    setClassCreating(true);
    try {
      await callApi("/api/admin/classes", { name: className, grade_block_id: classGradeId, school_year_id: classYearId, academic_term_id: classTermId });
      toast.show("Đã tạo lớp và gắn với năm học, học kỳ.", "success");
      await loadAll();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      classCreatingRef.current = false;
      setClassCreating(false);
    }
  }

  async function assignHomeroom(classId: string, academicTermId: string, teacherId: string) {
    try {
      await callApi(`/api/admin/classes/${classId}/homeroom`, { academic_term_id: academicTermId, teacher_id: teacherId || null });
      toast.show(teacherId ? "Đã phân công GVCN." : "Đã bỏ phân công GVCN.", "success");
      await loadAll();
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    }
  }

  return { years, terms, grades, classes, teachers, yearName, setYearName, yearStart, setYearStart, yearEnd, setYearEnd, termYearId, setTermYearId, termName, setTermName, termNumber, setTermNumber, termStart, setTermStart, termEnd, setTermEnd, gradeYearId, setGradeYearId, gradeName, setGradeName, classGradeId, setClassGradeId, classYearId, setClassYearId, classTermId, setClassTermId, className, setClassName, classCreating, loadAll, createYear, activateYear, createGrade, createTerm, activateTerm, createClass, assignHomeroom };
}

export type AdminModel = ReturnType<typeof useAdminModel>;
