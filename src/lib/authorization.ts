import { db } from "./db";
export type DataScope = "SELF" | "TEAM" | "CLASS";

const classRoles = new Set(["SYSTEM_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_MONITOR", "ACADEMIC_VICE_MONITOR", "DISCIPLINE_VICE_MONITOR"]);

export function dataScopeForRole(role: string): DataScope {
  if (classRoles.has(role)) return "CLASS";
  if (role === "TEAM_LEADER") return "TEAM";
  return "SELF";
}

export function canAccessClass(userClassId: string | null, targetClassId: string) {
  return Boolean(userClassId && userClassId === targetClassId);
}

export function canAccessStudent(params: { role: string; userClassId: string | null; userTeamId: string | null; targetClassId: string; targetTeamId: string | null; isSelf?: boolean }) {
  if (!canAccessClass(params.userClassId, params.targetClassId)) return false;
  const scope = dataScopeForRole(params.role);
  if (scope === "CLASS") return true;
  if (scope === "TEAM") return Boolean(params.userTeamId && params.userTeamId === params.targetTeamId);
  return Boolean(params.isSelf);
}

export function canManageAttendanceRecord(params: { role: string; userClassId: string | null; userTeamId: string | null; targetClassId: string; targetTeamId: string | null }) {
  if (!["SYSTEM_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_MONITOR", "TEAM_LEADER"].includes(params.role)) return false;
  return canAccessStudent(params);
}

export function canManageClassOfficers(role: string) {
  return role === "TEACHER" || role === "SYSTEM_ADMIN" || role === "PRINCIPAL";
}

export function canApproveEvent(role: string, creatorId: string, userId: string, subjectUserId?: string | null) {
  return ["TEACHER", "SYSTEM_ADMIN", "PRINCIPAL"].includes(role) && creatorId !== userId && subjectUserId !== userId;
}

export function canDownloadPrivateReport(role: string) {
  return role === "TEACHER" || role === "SYSTEM_ADMIN" || role === "PRINCIPAL";
}
export function roleMay(permission: string, role: string) {
  const forbidden = new Set(["event.approve","event.reject","score.adjust","weekly_result.finalize","weekly_result.reopen","private_report.view","private_report.export","role.assign","rule.manage","guardian.private_data.view"]);
  if (["TEACHER","SYSTEM_ADMIN","PRINCIPAL"].includes(role)) return true;
  if (forbidden.has(permission)) return false;
  const allowed = new Set(["class.view","student.view","attendance.view","attendance.create","attendance.update","event.view","event.create","score.view","task.view","task.update"]);
  return allowed.has(permission);
}
export async function canPerform(user: {id:string;role:string;classId:string|null;teamId:string|null}, permissionCode:string, target:{classId:string;teamId?:string|null;isSelf?:boolean}, now=new Date()) {
  if (!canAccessClass(user.classId,target.classId)) return false;
  if (["TEACHER","SYSTEM_ADMIN","PRINCIPAL"].includes(user.role)) return true;
  if (!roleMay(permissionCode,user.role)) return false;
  const appointment=await db.classOfficerAppointment.findFirst({where:{userId:user.id,classId:target.classId,role:user.role as never,active:true,startDate:{lte:now},OR:[{endDate:null},{endDate:{gte:now}}]}});
  if (["CLASS_MONITOR","ACADEMIC_VICE_MONITOR","DISCIPLINE_VICE_MONITOR","TEAM_LEADER"].includes(user.role)&&!appointment)return false;
  const grant=await db.rolePermission.findFirst({where:{role:user.role as never,permission:{code:permissionCode}}});
  if (!grant) return false;
  if (grant.scope==="CLASS") return true;
  if (grant.scope==="TEAM") return Boolean(appointment?.teamId&&appointment.teamId===target.teamId);
  return Boolean(target.isSelf);
}