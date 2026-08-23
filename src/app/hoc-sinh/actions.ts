"use server";

import { assertWriteAllowed } from "@/lib/license/runtime";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";

const studentSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(2, "Vui lòng nhập mã học sinh.").max(30),
  fullName: z.string().trim().min(2, "Vui lòng nhập họ và tên học sinh.").max(100),
  birthDate: z.string().optional(),
  gender: z.enum(["Nam", "Nữ", "Khác"]).optional(),
  ordinal: z.coerce.number().int().positive("Số thứ tự phải lớn hơn 0."),
  teamId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

export type StudentActionState = { ok?: boolean; error?: string } | null;

export async function saveStudent(_: StudentActionState, formData: FormData): Promise<StudentActionState> {await assertWriteAllowed();
  const user = await requireTeacher();
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const classId = user.classId!;
  const data = parsed.data;
  if (data.teamId) {
    const team = await db.team.findFirst({ where: { id: data.teamId, classId } });
    if (!team) return { error: "Tổ được chọn không thuộc lớp này." };
  }
  const duplicate = await db.student.findFirst({ where: { classId, code: data.code, NOT: data.id ? { id: data.id } : undefined } });
  if (duplicate) return { error: "Mã học sinh này đã tồn tại trong lớp." };
  if (data.id) {
    const current = await db.student.findFirst({ where: { id: data.id, classId, deletedAt: null } });
    if (!current) return { error: "Không tìm thấy học sinh hoặc bạn không có quyền sửa." };
    await db.$transaction(async (tx) => {
      await tx.student.update({ where: { id: current.id }, data: { code: data.code, fullName: data.fullName, birthDate: data.birthDate ? new Date(data.birthDate) : null, gender: data.gender, ordinal: data.ordinal, teamId: data.teamId || null, note: data.note || null } });
      if (current.teamId !== (data.teamId || null) && data.teamId) {
        await tx.$executeRaw`INSERT INTO TeamTransferHistory (id, studentId, classId, previousTeamId, newTeamId, reason, changedBy, changedAt) VALUES (${crypto.randomUUID()}, ${current.id}, ${classId}, ${current.teamId}, ${data.teamId}, ${String(formData.get("transferReason") || "Điều chỉnh phân tổ")}, ${user.id}, ${new Date()})`;
      }
      await tx.auditLog.create({ data: { userId: user.id, action: "UPDATE_STUDENT", entityType: "Student", entityId: current.id, classId, before: current, after: data } });
    });
  } else {
    const created = await db.$transaction(async (tx) => {
      const student = await tx.student.create({ data: { code: data.code, fullName: data.fullName, birthDate: data.birthDate ? new Date(data.birthDate) : null, gender: data.gender, ordinal: data.ordinal, teamId: data.teamId || null, note: data.note || null, classId } });
      await tx.auditLog.create({ data: { userId: user.id, action: "CREATE_STUDENT", entityType: "Student", entityId: student.id, classId, after: data } });
      return student;
    });
    redirect(`/hoc-sinh/${created.id}`);
  }
  revalidatePath("/hoc-sinh");
  return { ok: true };
}

export async function changeStudentStatus(formData: FormData) {await assertWriteAllowed();
  const user = await requireTeacher();
  const parsed = z.object({ id: z.string(), status: z.enum(["ACTIVE", "TRANSFERRED", "RESERVED", "WITHDRAWN"]) }).parse(Object.fromEntries(formData));
  const current = await db.student.findFirst({ where: { id: parsed.id, classId: user.classId!, deletedAt: null } });
  if (!current) throw new Error("Không tìm thấy học sinh.");
  await db.$transaction([
    db.student.update({ where: { id: current.id }, data: { status: parsed.status } }),
    db.auditLog.create({ data: { userId: user.id, action: "CHANGE_STUDENT_STATUS", entityType: "Student", entityId: current.id, classId: user.classId, before: { status: current.status }, after: { status: parsed.status } } }),
  ]);
  revalidatePath("/hoc-sinh");
}

export async function addGuardian(_: StudentActionState, formData: FormData): Promise<StudentActionState> {await assertWriteAllowed();
  const user = await requireTeacher();
  const parsed = z.object({ studentId: z.string(), name: z.string().trim().min(2, "Vui lòng nhập tên người giám hộ."), phone: z.string().trim().regex(/^(0\d{9})?$/, "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0."), email: z.string().trim().email("Email chưa đúng định dạng.").or(z.literal("")), relation: z.string().trim().min(1), isPrimary: z.coerce.boolean().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const student = await db.student.findFirst({ where: { id: parsed.data.studentId, classId: user.classId!, deletedAt: null } });
  if (!student) return { error: "Không tìm thấy học sinh hoặc bạn không có quyền." };
  await db.$transaction(async (tx) => {
    if (parsed.data.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId: student.id }, data: { isPrimary: false } });
    const guardian = await tx.guardian.create({ data: { name: parsed.data.name, phone: parsed.data.phone || null, email: parsed.data.email || null } });
    await tx.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relation: parsed.data.relation, isPrimary: Boolean(parsed.data.isPrimary) } });
    await tx.auditLog.create({ data: { userId: user.id, action: "ADD_GUARDIAN", entityType: "Guardian", entityId: guardian.id, classId: user.classId, after: { studentId: student.id, name: guardian.name, relation: parsed.data.relation } } });
  });
  revalidatePath(`/hoc-sinh/${student.id}`);
  return { ok: true };
}

export type ImportRow = { row: number; code: string; fullName: string; birthDate: string; gender: string; ordinal: number; team: string; guardianName: string; guardianPhone: string; relation: string; errors: string[] };
export type ImportState = { rows?: ImportRow[]; error?: string; imported?: number } | null;

export async function previewStudentExcel(_: ImportState, formData: FormData): Promise<ImportState> {
  await requireTeacher();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Vui lòng chọn file Excel." };
  if (file.size > 5 * 1024 * 1024) return { error: "File không được lớn hơn 5 MB." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Chỉ chấp nhận file .xlsx." };
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); } catch { return { error: "Không thể đọc file Excel. Hãy dùng file mẫu của hệ thống." }; }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "File Excel không có trang dữ liệu." };
  const rows: ImportRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const text = (cell: number) => String(row.getCell(cell).text || "").trim();
    if (!text(1) && !text(2)) return;
    const item: ImportRow = { row: index, code: text(1), fullName: text(2), birthDate: text(3), gender: text(4), ordinal: Number(text(5)), team: text(6), guardianName: text(7), guardianPhone: text(8), relation: text(9) || "Người giám hộ", errors: [] };
    if (!item.code) item.errors.push("Thiếu mã học sinh");
    if (!item.fullName) item.errors.push("Thiếu họ và tên");
    if (!Number.isInteger(item.ordinal) || item.ordinal < 1) item.errors.push("Số thứ tự không hợp lệ");
    if (item.birthDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(item.birthDate)) item.errors.push("Ngày sinh phải theo dd/MM/yyyy");
    if (item.guardianPhone && !/^0\d{9}$/.test(item.guardianPhone)) item.errors.push("Số điện thoại người giám hộ không hợp lệ");
    rows.push(item);
  });
  return rows.length ? { rows } : { error: "File không có dòng học sinh nào." };
}

export async function confirmStudentImport(formData: FormData) {await assertWriteAllowed();
  const user = await requireTeacher();
  const rows = z.array(z.object({ row: z.number(), code: z.string(), fullName: z.string(), birthDate: z.string(), gender: z.string(), ordinal: z.number(), team: z.string(), guardianName: z.string(), guardianPhone: z.string(), relation: z.string(), errors: z.array(z.string()) })).parse(JSON.parse(String(formData.get("rows"))));
  if (rows.some((row) => row.errors.length)) throw new Error("Vui lòng sửa các dòng lỗi trước khi nhập.");
  const classId = user.classId!;
  const existing = new Set((await db.student.findMany({ where: { classId }, select: { code: true } })).map((s) => s.code.toLowerCase()));
  const teams = await db.team.findMany({ where: { classId } });
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.code.toLowerCase();
    if (existing.has(key) || seen.has(key)) throw new Error(`Mã học sinh ${row.code} đã tồn tại hoặc bị trùng trong file.`);
    if (row.team && !teams.some((t) => t.name.toLowerCase() === row.team.toLowerCase())) throw new Error(`Dòng ${row.row}: tổ “${row.team}” không tồn tại.`);
    seen.add(key);
  }
  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const [day, month, year] = row.birthDate.split("/").map(Number);
      const team = teams.find((t) => t.name.toLowerCase() === row.team.toLowerCase());
      const student = await tx.student.create({ data: { code: row.code, fullName: row.fullName, birthDate: row.birthDate ? new Date(year, month - 1, day) : null, gender: row.gender || null, ordinal: row.ordinal, classId, teamId: team?.id } });
      if (row.guardianName) {
        const guardian = await tx.guardian.create({ data: { name: row.guardianName, phone: row.guardianPhone || null } });
        await tx.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relation: row.relation, isPrimary: true } });
      }
    }
    await tx.auditLog.create({ data: { userId: user.id, action: "IMPORT_STUDENTS", entityType: "Student", classId, after: { imported: rows.length } } });
  });
  redirect(`/hoc-sinh?imported=${rows.length}`);
}
