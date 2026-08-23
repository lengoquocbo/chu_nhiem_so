import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
import { StudentForm } from "@/components/student-form";
export default async function NewStudent() {
  const user = await requireTeacher();
  const teams = await db.team.findMany({ where: { classId: user.classId! }, orderBy: { name: "asc" } });
  return <Shell user={user}><div className="mb-6"><h1 className="text-3xl font-extrabold">Thêm học sinh</h1><p className="mt-2 text-slate-500">Các trường có dấu * là bắt buộc.</p></div><section className="card max-w-4xl p-6"><StudentForm teams={teams} /></section></Shell>;
}
