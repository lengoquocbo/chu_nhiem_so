import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  // Upsert school
  const school = await db.school.upsert({
    where: { code: "AD-DEMO" },
    update: {},
    create: {
      name: "Trường THCS Ánh Dương",
      code: "AD-DEMO",
    },
  });

  // Upsert classroom
  const classroom = await db.classroom.upsert({
    where: { name: "8A1" },
    update: {},
    create: {
      name: "8A1",
      schoolId: school.id,
      teacherName: "Quốc Bảo",
    },
  });

  // Hash password
  const passwordHash = await bcrypt.hash("Giaovien@123", 12);

  // Upsert admin user
  await db.user.upsert({
    where: { email: "quocboadmin@chunhiemso.local" },
    update: {
      passwordHash,
      name: "Quốc Bảo",
      username: "quocboadmin",
      role: Role.SYSTEM_ADMIN,
      schoolId: school.id,
      classId: classroom.id,
    },
    create: {
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

  console.log("✅ Admin user and initial setup flag created/updated");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());