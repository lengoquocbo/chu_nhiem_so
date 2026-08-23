import { PrismaClient, Role, EventType, EventStatus, AttendanceStatus, RuleSetStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
async function main() {
  await db.auditLog.deleteMany(); await db.studentWeeklyResult.deleteMany(); await db.scoreAdjustment.deleteMany(); await db.competitionEvent.deleteMany(); await db.attendanceRecord.deleteMany(); await db.classSession.deleteMany(); await db.task.deleteMany(); await db.competitionWeek.deleteMany(); await db.ruleItem.deleteMany(); await db.ruleSet.deleteMany(); await db.studentGuardian.deleteMany(); await db.guardian.deleteMany(); await db.student.deleteMany(); await db.team.deleteMany(); await db.user.deleteMany(); await db.classroom.deleteMany(); await db.semester.deleteMany(); await db.schoolYear.deleteMany(); await db.school.deleteMany();
  const school = await db.school.create({data:{name:"Trường THCS Ánh Dương",code:"AD-DEMO"}});
  const year = await db.schoolYear.create({data:{name:"2026–2027",schoolId:school.id}});
  const semester = await db.semester.create({data:{name:"Học kỳ I",schoolYearId:year.id,startDate:new Date("2026-08-17"),endDate:new Date("2027-01-10")}});
  const classroom = await db.classroom.create({data:{name:"8A1",schoolId:school.id,semesterId:semester.id,teacherName:"Nguyễn Minh An"}});
  const teams = await Promise.all([1,2,3,4].map(n=>db.team.create({data:{name:`Tổ ${n}`,classId:classroom.id}})));
  const passwordHash = await bcrypt.hash("Giaovien@123",12);
  const teacher = await db.user.create({data:{email:"giaovien@chunhiemso.local",passwordHash,name:"Nguyễn Minh An",role:Role.TEACHER,schoolId:school.id,classId:classroom.id}});
  const names=["Nguyễn An Bình","Trần Gia Hân","Lê Minh Khang","Phạm Khánh Linh","Võ Anh Dũng","Đặng Ngọc Mai","Bùi Đức Anh","Đỗ Thanh Trúc","Hồ Nhật Nam","Ngô Bảo Châu","Dương Tuấn Kiệt","Lý Phương Thảo","Mai Quốc Bảo","Tạ Mỹ Duyên","Trương Hoàng Long","Cao Kim Ngân","Lâm Minh Quân","Vũ Hà My","Phan Tiến Đạt","Nguyễn Yến Nhi"];
  const students=[];
  for(let i=0;i<names.length;i++){ const s=await db.student.create({data:{code:`HS${String(i+1).padStart(3,"0")}`,fullName:names[i],ordinal:i+1,gender:i%2?"Nữ":"Nam",birthDate:new Date(`2012-${String((i%9)+1).padStart(2,"0")}-${String((i%20)+1).padStart(2,"0")}`),classId:classroom.id,teamId:teams[i%4].id}}); students.push(s); const g=await db.guardian.create({data:{name:`Phụ huynh của ${names[i]}`,phone:`090000${String(i+1).padStart(4,"0")}`}}); await db.studentGuardian.create({data:{studentId:s.id,guardianId:g.id,relation:i%2?"Mẹ":"Bố",isPrimary:true}}); }
  const roles=[[Role.CLASS_MONITOR,students[0],"loptruong"],[Role.ACADEMIC_VICE_MONITOR,students[1],"lopphohoc"],[Role.DISCIPLINE_VICE_MONITOR,students[2],"lopphokl"],[Role.TEAM_LEADER,students[3],"totruong"]] as const;
  for(const [role,s,mail] of roles) await db.user.create({data:{email:`${mail}@chunhiemso.local`,passwordHash,name:s.fullName,role,schoolId:school.id,classId:classroom.id,teamId:s.teamId}});
  await db.user.create({data:{email:"hocsinh@chunhiemso.local",passwordHash,name:students[4].fullName,role:Role.STUDENT,schoolId:school.id,classId:classroom.id,teamId:students[4].teamId}});
  await db.user.create({data:{email:"phuhuynh@chunhiemso.local",passwordHash,name:"Phụ huynh mẫu",role:Role.GUARDIAN,schoolId:school.id,classId:classroom.id}});
  const rules=await db.ruleSet.create({data:{name:"Nội quy thi đua tích cực",version:1,classId:classroom.id,startDate:new Date("2026-08-17"),initialScore:100,status:RuleSetStatus.PUBLISHED}});
  const items=await Promise.all([
    ["CC-VKP","Vắng không phép","Chuyên cần",EventType.PENALTY,-10],["CC-DM","Đi muộn","Chuyên cần",EventType.PENALTY,-2],["HT-PT","Phát biểu xây dựng bài","Học tập",EventType.BONUS,3],["TD-GD","Giúp đỡ bạn bè","Tinh thần giúp đỡ",EventType.BONUS,5]
  ].map(([code,name,category,type,points])=>db.ruleItem.create({data:{code:code as string,name:name as string,category:category as string,type:type as EventType,points:points as number,ruleSetId:rules.id,dailyLimit:3,weeklyLimit:10}})));
  const week=await db.competitionWeek.create({data:{number:1,startDate:new Date("2026-08-17"),endDate:new Date("2026-08-23"),classId:classroom.id,ruleSetId:rules.id}});
  const session=await db.classSession.create({data:{date:new Date("2026-08-17"),period:"Sáng",classId:classroom.id,weekId:week.id}});
  for(let i=0;i<students.length;i++) await db.attendanceRecord.create({data:{sessionId:session.id,studentId:students[i].id,status:i===5?AttendanceStatus.LATE:i===9?AttendanceStatus.ABSENT_EXCUSED:AttendanceStatus.PRESENT,approved:true}});
  await db.competitionEvent.createMany({data:[{weekId:week.id,studentId:students[0].id,ruleItemId:items[2].id,occurredAt:new Date("2026-08-18"),proposedPoints:3,approvedPoints:3,description:"Tích cực phát biểu trong giờ Ngữ văn",status:EventStatus.APPROVED,creatorId:teacher.id,approvedBy:teacher.id,approvedAt:new Date()},{weekId:week.id,studentId:students[4].id,ruleItemId:items[3].id,occurredAt:new Date("2026-08-18"),proposedPoints:5,description:"Hỗ trợ bạn hoàn thành nhiệm vụ nhóm",status:EventStatus.PENDING,creatorId:teacher.id},{weekId:week.id,studentId:students[6].id,ruleItemId:items[1].id,occurredAt:new Date("2026-08-19"),proposedPoints:-2,approvedPoints:-2,description:"Đến lớp sau giờ vào học",status:EventStatus.APPROVED,creatorId:teacher.id,approvedBy:teacher.id,approvedAt:new Date()}]});
  await db.task.createMany({data:[{title:"Trang trí góc học tập",description:"Hoàn thiện bảng tin của lớp",assignee:"Tổ 1",priority:"Trung bình",status:"Đang làm",dueDate:new Date("2026-08-22"),classId:classroom.id},{title:"Chuẩn bị sinh hoạt tuần",description:"Tổng hợp các việc nổi bật",assignee:"Ban cán sự",priority:"Cao",status:"Chưa làm",dueDate:new Date("2026-08-21"),classId:classroom.id}]});
  console.log("Seed thành công: giaovien@chunhiemso.local / Giaovien@123");
}
main().finally(()=>db.$disconnect());
