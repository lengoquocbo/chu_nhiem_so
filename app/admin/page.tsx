"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, callApi } from "@/lib/supabaseClient";
import { AppShell, type AppMenuItem } from "@/lib/ui/AppShell";
import { Section, EmptyState } from "@/lib/ui/Section";
import { ToastProvider, useToast } from "@/lib/ui/Toast";
import { useRoleGuard, RoleGuardMessage } from "@/lib/useRoleGuard";

type SchoolYear = { id: string; name: string; start_date: string; end_date: string; status: string };
type AcademicTerm = { id: string; school_year_id: string; name: string; term_number: number; start_date: string; end_date: string; status: string };
type Grade = { id: string; name: string; school_year_id: string };
type ClassTermLink = { id: string; academic_term_id: string; academic_terms?: AcademicTerm | null; homeroom_term_assignments?: { id: string; teacher_id: string; status: string; profiles?: Teacher | null }[] };
type ClassRow = { id: string; name: string; class_code: string; homeroom_teacher_id: string | null; grade_block_id: string; school_year_id: string; class_academic_terms?: ClassTermLink[] };
type Teacher = { id: string; full_name: string };
type StudentItem = { id: string; full_name: string };
type CreatedAccount = { email: string; temporary_password: string };

const ROLE_OPTIONS = [
  { value: "homeroom_teacher", label: "Giáo viên chủ nhiệm (GVCN)" },
  { value: "subject_teacher", label: "Giáo viên bộ môn (GVBM)" },
  { value: "principal", label: "Hiệu trưởng / BGH" },
  { value: "student", label: "Học sinh" },
  { value: "parent", label: "Phụ huynh" },
];

const ADMIN_MENU: AppMenuItem[] = [
  { id: "accounts", label: "Tài khoản", description: "Tạo và phân quyền", icon: "users", roles: ["principal"] },
  { id: "years", label: "Năm học", description: "Kỳ học và trạng thái", icon: "calendar", roles: ["principal"] },
  { id: "terms", label: "Học kỳ", description: "Thời gian từng học kỳ", icon: "calendar", roles: ["principal"] },
  { id: "grades", label: "Khối học", description: "Cấu trúc khối", icon: "layers", roles: ["principal"] },
  { id: "classes", label: "Lớp học", description: "Lớp và giáo viên chủ nhiệm", icon: "school", roles: ["principal"] },
];

export default function AdminPage() {
  const guard = useRoleGuard(["principal"]);
  const [activeSection, setActiveSection] = useState("accounts");
  if (guard !== "allowed") return <RoleGuardMessage status={guard} />;

  const selected = ADMIN_MENU.find((item) => item.id === activeSection) || ADMIN_MENU[0];

  return (
    <ToastProvider>
      <AppShell
        title={selected.label}
        subtitle="Không gian quản trị dành cho Hiệu trưởng / Admin"
        currentPath="/admin"
        menuItems={ADMIN_MENU}
        activeItem={activeSection}
        onMenuSelect={setActiveSection}
      >
        <AdminContent activeSection={activeSection} />
      </AppShell>
    </ToastProvider>
  );
}

function AdminContent({ activeSection }: { activeSection: string }) {
  const toast = useToast();
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

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
    const [y, term, g, c, t] = await Promise.all([
      supabase.from("school_years").select("*").order("created_at", { ascending: false }),
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
    const { error } = await supabase.from("school_years").insert({ name: yearName, start_date: yearStart, end_date: yearEnd });
    toast.show(error ? `Lỗi: ${error.message}` : "Đã tạo năm học.", error ? "error" : "success");
    loadAll();
  }

  async function activateYear(id: string) {
    const previousActive = years.find((year) => year.status === "active");
    const { error: closeError } = await supabase
      .from("school_years")
      .update({ status: "closed" })
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

  return (
    <>
      {/* ========== TẠO TÀI KHOẢN ========== */}
      {activeSection === "accounts" && <Section
        title="Tạo tài khoản người dùng"
        description="Tạo tài khoản đăng nhập cho giáo viên, học sinh hoặc phụ huynh. Admin đặt mật khẩu ban đầu và gửi riêng cho người dùng."
      >
        <CreateAccountForm classes={classes} onCreated={loadAll} />
      </Section>}

      {/* ========== QUẢN LÝ NĂM HỌC / KHỐI / LỚP ========== */}
      {activeSection === "years" && <Section title="Năm học">
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
      </Section>}

      {activeSection === "terms" && <Section title="Học kỳ" description="Tạo các học kỳ nằm trong phạm vi ngày của năm học tương ứng.">
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
      </Section>}

      {activeSection === "grades" && <Section title="Khối">
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
      </Section>}

      {activeSection === "classes" && <Section title={`Danh sách lớp (${classes.length})`} description="Hiệu trưởng xem toàn bộ lớp và phân công Giáo viên chủ nhiệm tại đây.">
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
      </Section>}
    </>
  );
}

/* ================================================================
   FORM TẠO TÀI KHOẢN TỔNG HỢP (chọn role → form động)
   ================================================================ */
function CreateAccountForm({ classes, onCreated }: { classes: ClassRow[]; onCreated: () => Promise<void> }) {
  const toast = useToast();

  // --- Chung ---
  const [role, setRole] = useState("homeroom_teacher");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreatedAccount | null>(null);

  // --- Học sinh / Phụ huynh: chọn lớp → load HS ---
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  // --- Phụ huynh ---
  const [relationship, setRelationship] = useState("guardian");

  const isTeacher = role === "homeroom_teacher" || role === "subject_teacher" || role === "principal";
  const isStudent = role === "student";
  const isParent = role === "parent";
  const needsClass = isStudent || isParent;

  // Reset state khi đổi role
  function handleRoleChange(newRole: string) {
    setRole(newRole);
    setEmail("");
    setFullName("");
    setPassword("");
    setConfirmPassword("");
    setResult(null);
    setSelectedClassId("");
    setStudents([]);
    setSelectedStudentId("");
    setRelationship("guardian");
  }

  // Load học sinh khi chọn lớp
  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setSelectedStudentId("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("student_class_enrollments")
        .select("student_id, students(id, full_name)")
        .eq("class_id", selectedClassId)
        .is("left_at", null);
      if (error) {
        setStudents([]);
        setSelectedStudentId("");
        toast.show(`Không tải được danh sách học sinh: ${error.message}`, "error");
        return;
      }
      const list = ((data || []) as any[])
        .map((r) => r.students)
        .filter(Boolean)
        .map((s: any) => ({ id: s.id, full_name: s.full_name }));
      setStudents(list);
      setSelectedStudentId("");
    })();
  }, [selectedClassId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.show("Mật khẩu phải có ít nhất 8 ký tự.", "error");
      return;
    }
    if (password !== confirmPassword) {
      toast.show("Mật khẩu xác nhận không khớp.", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      let res: CreatedAccount;
      if (isTeacher) {
        res = await callApi("/api/admin/teachers", {
          email,
          full_name: fullName,
          role,
          password,
        });
        toast.show(`Đã tạo tài khoản giáo viên cho ${fullName}.`, "success");
      } else if (isStudent) {
        res = await callApi("/api/admin/students/create-login", {
          student_id: selectedStudentId,
          email,
          password,
        });
        toast.show("Đã tạo tài khoản học sinh.", "success");
      } else if (isParent) {
        res = await callApi("/api/admin/parents/create-login", {
          student_id: selectedStudentId,
          email,
          full_name: fullName,
          relationship,
          password,
        });
        toast.show(`Đã tạo tài khoản phụ huynh cho ${fullName}.`, "success");
      } else {
        throw new Error("Vai trò tài khoản không hợp lệ.");
      }
      setResult(res);
      await onCreated();
      // Reset form (giữ nguyên role)
      setEmail("");
      setFullName("");
      setPassword("");
      setConfirmPassword("");
      setSelectedStudentId("");
    } catch (err: any) {
      toast.show(`Lỗi: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Chọn role */}
      <div className="mb-5">
        <label className="field-label">Vai trò cần tạo tài khoản</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleRoleChange(opt.value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                role === opt.value
                  ? "border-navy bg-navy text-white"
                  : "border-line bg-white text-ink hover:border-navy/50 hover:text-navy"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        {/* ---- GIÁO VIÊN ---- */}
        {isTeacher && (
          <>
            <div>
              <label className="field-label">Họ tên</label>
              <input
                className="field-input w-48"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Nguyễn Thị B"
              />
            </div>
            <div>
              <label className="field-label">Email đăng nhập</label>
              <input
                type="email"
                className="field-input w-56"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="giaovien@truong.edu.vn"
              />
            </div>
          </>
        )}

        {/* ---- HỌC SINH / PHỤ HUYNH: chọn lớp + học sinh ---- */}
        {needsClass && (
          <>
            <div>
              <label className="field-label">Lớp</label>
              <select
                className="field-input w-40"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                required
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">{isParent ? "Học sinh liên kết" : "Học sinh"}</label>
              <select
                className="field-input w-56"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
                disabled={!selectedClassId}
              >
                <option value="">-- Chọn học sinh --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ---- PHỤ HUYNH: thêm tên + quan hệ ---- */}
        {isParent && (
          <>
            <div>
              <label className="field-label">Họ tên phụ huynh</label>
              <input
                className="field-input w-48"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Nguyễn Văn A"
              />
            </div>
            <div>
              <label className="field-label">Quan hệ</label>
              <select className="field-input w-36" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="father">Bố</option>
                <option value="mother">Mẹ</option>
                <option value="guardian">Người giám hộ</option>
              </select>
            </div>
          </>
        )}

        {/* ---- EMAIL (học sinh + phụ huynh) ---- */}
        {needsClass && (
          <div>
            <label className="field-label">Email đăng nhập</label>
            <input
              type="email"
              className="field-input w-56"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={isStudent ? "hocsinh@email.com" : "phuhuynh@email.com"}
            />
          </div>
        )}

        <div>
          <label className="field-label">Mật khẩu</label>
          <input
            type="password"
            className="field-input w-48"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
          />
        </div>
        <div>
          <label className="field-label">Xác nhận mật khẩu</label>
          <input
            type="password"
            className="field-input w-48"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
      </form>

      {/* Cảnh báo khi lớp chưa có học sinh */}
      {needsClass && students.length === 0 && selectedClassId && (
        <p className="mt-3 text-sm text-ink-muted">
          Lớp này chưa có học sinh. Hãy import danh sách học sinh trước.
        </p>
      )}

      {/* Kết quả */}
      {result && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm">
          <div className="font-medium text-green-800">✓ Tạo tài khoản thành công</div>
          <div className="mt-1">
            Email: <span className="font-medium">{result.email}</span>
          </div>
          <div className="mt-0.5">
            Mật khẩu ban đầu:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm border border-green-200">
              {result.temporary_password}
            </code>
          </div>
          <div className="mt-1.5 text-green-700">
            Gửi thông tin này cho người dùng và yêu cầu đổi mật khẩu ngay khi đăng nhập lần đầu.
          </div>
        </div>
      )}
    </div>
  );
}
