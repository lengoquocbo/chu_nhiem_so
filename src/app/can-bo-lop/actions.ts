"use server";

import { assertWriteAllowed } from "@/lib/license/runtime";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";

const officerRoles = ["CLASS_MONITOR", "ACADEMIC_VICE_MONITOR", "DISCIPLINE_VICE_MONITOR", "TEAM_LEADER"] as const;
const appointmentSchema = z.object({
  studentId: z.string().min(1),
  userId: z.string().optional(),
  role: z.enum(officerRoles),
  teamId: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.union([z.literal(""), z.coerce.date()]).optional(),
  note: z.string().trim().max(500).optional(),
  classId: z.string().optional(),
  status: z.enum(["DRAFT","SCHEDULED","ACTIVE"]).optional(),
});

export async function appointClassOfficer(formData: FormData) {await assertWriteAllowed();
  const actor = await requireTeacher();
  const parsed = appointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Thông tin bổ nhiệm chưa hợp lệ.");
  const classId = parsed.data.classId || actor.classId!;
  const allowedClass = await db.classroom.findFirst({ where: { id: classId, schoolId: actor.schoolId!, OR: [{ id: actor.classId || undefined }, { memberships: { some: { userId: actor.id, role: "TEACHER", active: true } } }] } });
  if (!allowedClass && actor.role !== "SYSTEM_ADMIN") throw new Error("Bạn kh·ng phải giáo viên chủ nhiệm của lớp này.");
  const { studentId, role, startDate } = parsed.data;
  const endDate = parsed.data.endDate || null;
  if (endDate && endDate < startDate) throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");
  const student = await db.student.findFirst({ where: { id: studentId, classId, deletedAt: null }, include: { team: true } });
  if (!student) throw new Error("H?c sinh kh·ng thuộc l?p đang quản lý.");
  const teamId = role === "TEAM_LEADER" ? (parsed.data.teamId || student.teamId) : null;
  if (role === "TEAM_LEADER" && !teamId) throw new Error("Tổ trưởng phải thuộc một tổ.");
  if (teamId && !(await db.team.findFirst({ where: { id: teamId, classId } }))) throw new Error("T? được chọn kh·ng thuộc l?p này.");
  const userId = parsed.data.userId || null;
  if (userId && !(await db.user.findFirst({ where: { id: userId, classId, schoolId: actor.schoolId } }))) throw new Error("Tài khoản kh·ng thuộc trường và lớp này.");
  const now = new Date();
  await db.classOfficerAppointment.updateMany({ where:{ classId, active:true, endDate:{ lt:now } }, data:{ active:false } });
  const conflicting = await db.classOfficerAppointment.findFirst({ where: { classId, active: true, startDate:{ lte:endDate || new Date("9999-12-31") }, AND:[{ OR:[{endDate:null},{endDate:{gte:startDate}}] },{ OR:[{ studentId }, role === "TEAM_LEADER" ? { role: Role.TEAM_LEADER, teamId } : { role: role as Role }] }] } });
  if (conflicting && parsed.data.status !== "DRAFT") throw new Error("H?c sinh hoặc chức vụ này dang c· m?t bổ nhiệm còn hiệu lực.");
  await db.$transaction(async (tx) => {
    const appointment = await tx.classOfficerAppointment.create({ data: { studentId, userId, classId, teamId, role: role as Role, startDate, endDate, status: parsed.data.status || (startDate>new Date()?"SCHEDULED":"ACTIVE"), active: parsed.data.status!=="DRAFT", note: parsed.data.note || null, appointedBy: actor.id } });
    if (userId) await tx.user.update({ where: { id: userId }, data: { role: role as Role, teamId } });
    await tx.auditLog.create({ data: { userId: actor.id, action: "APPOINT_CLASS_OFFICER", entityType: "ClassOfficerAppointment", entityId: appointment.id, schoolId: actor.schoolId, classId, after: { studentId, userId, role, teamId, startDate: startDate.toISOString(), endDate: endDate?.toISOString() || null } } });
  });
  revalidatePath("/can-bo-lop");
}

export async function revokeClassOfficer(formData: FormData) {await assertWriteAllowed();
  const actor = await requireTeacher();
  const id = z.string().min(1).parse(formData.get("id"));
  const reason = z.string().trim().min(3, "Vui lòng nh?p l· do thu hồi.").max(300).parse(formData.get("reason"));
  const appointment = await db.classOfficerAppointment.findFirst({ where: { id, classId: actor.classId!, active: true } });
  if (!appointment) throw new Error("B? nhi?m kh·ng tồn tại hoặc đã du?c thu hồi.");
  await db.$transaction(async (tx) => {
    await tx.classOfficerAppointment.update({ where: { id }, data: { active: false, status:"REVOKED", endDate: new Date(), revokedAt:new Date(), revokedBy:actor.id, revokeReason:reason } });
    if (appointment.userId) { const remaining=await tx.classOfficerAppointment.findFirst({where:{userId:appointment.userId,active:true,id:{not:id},startDate:{lte:new Date()},OR:[{endDate:null},{endDate:{gte:new Date()}}]}}); await tx.user.update({where:{id:appointment.userId},data:remaining?{role:remaining.role,teamId:remaining.teamId}:{role:Role.STUDENT,teamId:appointment.teamId}}); }
    await tx.auditLog.create({ data: { userId: actor.id, action: "REVOKE_CLASS_OFFICER", entityType: "ClassOfficerAppointment", entityId: id, schoolId: actor.schoolId, classId: actor.classId, before: { active: true, role: appointment.role }, after: { active: false, reason } } });
  });
  revalidatePath("/can-bo-lop");
}
export async function updateClassOfficer(formData:FormData){await assertWriteAllowed();const actor=await requireTeacher();const id=z.string().parse(formData.get("id"));const parsed=appointmentSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)throw new Error("Thông tin chỉnh sửa chưa hợp lệ.");const current=await db.classOfficerAppointment.findFirst({where:{id,classroom:{schoolId:actor.schoolId!}}});if(!current)throw new Error("Không tìm thấy bổ nhiệm.");const end=parsed.data.endDate||null;if(end&&end<parsed.data.startDate)throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");const teamId=parsed.data.role==="TEAM_LEADER"?(parsed.data.teamId||null):null;if(parsed.data.role==="TEAM_LEADER"&&(!teamId||!await db.team.findFirst({where:{id:teamId,classId:current.classId}})))throw new Error("Tổ trưởng phải có tổ đúng lớp.");const now=new Date(),hasStarted=current.startDate<=now&&current.status!=="DRAFT";await db.$transaction(async tx=>{if(hasStarted&&(current.studentId!==parsed.data.studentId||current.role!==parsed.data.role)){await tx.classOfficerAppointment.update({where:{id},data:{active:false,status:"EXPIRED",endDate:now}});const next=await tx.classOfficerAppointment.create({data:{studentId:parsed.data.studentId,userId:parsed.data.userId||null,classId:current.classId,teamId,role:parsed.data.role,startDate:now,endDate:end,status:"ACTIVE",active:true,appointedBy:actor.id,note:parsed.data.note||null,previousAppointmentId:id,version:current.version+1}});await tx.auditLog.create({data:{userId:actor.id,action:"VERSION_CLASS_OFFICER",entityType:"ClassOfficerAppointment",entityId:next.id,classId:current.classId,before:current,after:{...parsed.data,previousAppointmentId:id}}})}else{const updated=await tx.classOfficerAppointment.update({where:{id},data:{studentId:parsed.data.studentId,userId:parsed.data.userId||null,teamId,role:parsed.data.role,startDate:parsed.data.startDate,endDate:end,note:parsed.data.note||null,status:parsed.data.status||current.status,active:(parsed.data.status||current.status)!=="DRAFT"}});await tx.auditLog.create({data:{userId:actor.id,action:"UPDATE_CLASS_OFFICER",entityType:"ClassOfficerAppointment",entityId:id,classId:current.classId,before:current,after:updated}})}});revalidatePath("/can-bo-lop")}
export async function deleteDraftAppointment(formData:FormData){await assertWriteAllowed();const actor=await requireTeacher();const id=z.string().parse(formData.get("id"));const row=await db.classOfficerAppointment.findFirst({where:{id,status:"DRAFT",classroom:{schoolId:actor.schoolId!}}});if(!row)throw new Error("Chỉ được xóa bổ nhiệm nháp chưa từng có hiệu lực.");await db.$transaction([db.auditLog.create({data:{userId:actor.id,action:"DELETE_DRAFT_APPOINTMENT",entityType:"ClassOfficerAppointment",entityId:id,classId:row.classId,before:row}}),db.classOfficerAppointment.delete({where:{id}})]);revalidatePath("/can-bo-lop")}