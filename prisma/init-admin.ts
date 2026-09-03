import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  // Check if admin already exists — skip if so
  const existing = await db.user.findFirst({ where: { role: "SYSTEM_ADMIN" } });
  if (existing) {
    console.log("✅ SYSTEM_ADMIN already exists, skipping init-admin.");
    return;
  }

  // Upsert school
  const school = await db.school.upsert({
    where: { code: "AD-DEMO" },
    update: {},
    create: { name: "Trường THCS Ánh Dương", code: "AD-DEMO" },
  });

  // Upsert school year
  let year = await db.schoolYear.findFirst({
    where: { schoolId: school.id, name: "2026-2027" },
  });
  if (!year) {
    year = await db.schoolYear.create({
      data: {
        name: "2026-2027",
        schoolId: school.id,
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2027-07-31T00:00:00Z"),
        isActive: true,
      },
    });
  }

  // Upsert semester
  let semester = await db.semester.findFirst({
    where: { schoolYearId: year.id, name: "Học kỳ I" },
  });
  if (!semester) {
    semester = await db.semester.create({
      data: {
        name: "Học kỳ I",
        schoolYearId: year.id,
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
      },
    });
  }

  // Upsert classroom
  let classroom = await db.classroom.findFirst({
    where: { semesterId: semester.id, name: "8A1" },
  });
  if (!classroom) {
    classroom = await db.classroom.create({
      data: {
        name: "8A1",
        schoolId: school.id,
        semesterId: semester.id,
        teacherName: "Quốc Bảo",
      },
    });
  }

  // Hash password
  const passwordHash = await bcrypt.hash("Giaovien@123", 12);

  // Create admin user
  await db.user.create({
    data: {
      email: "quocboadmin@chunhiemso.local",
      username: "quocboadmin",
      passwordHash,
      name: "Quốc Bảo",
      role: Role.SYSTEM_ADMIN,
      schoolId: school.id,
      classId: classroom.id,
    },
  });

  // Ensure initial setup flag exists
  await db.systemSetting.upsert({
    where: { key: "INITIAL_SETUP_COMPLETED" },
    update: { value: new Date().toISOString() },
    create: { key: "INITIAL_SETUP_COMPLETED", value: new Date().toISOString() },
  });

  console.log("✅ Admin user created: quocboadmin / Giaovien@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());