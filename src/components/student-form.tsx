"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveStudent } from "@/app/hoc-sinh/actions";

type StudentValue = { id?: string; code?: string; fullName?: string; birthDate?: string; gender?: string | null; ordinal?: number; teamId?: string | null; note?: string | null };

export function StudentForm({ student = {}, teams }: { student?: StudentValue; teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveStudent, null);
  return <form action={action} className="space-y-5">
    {student.id && <input type="hidden" name="id" value={student.id} />}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Mã học sinh *"><input className="input" name="code" required defaultValue={student.code} placeholder="Ví dụ: HS021" /></Field>
      <Field label="Họ và tên *"><input className="input" name="fullName" required defaultValue={student.fullName} placeholder="Ví dụ: Nguyễn Minh Anh" /></Field>
      <Field label="Ngày sinh"><input className="input" name="birthDate" type="date" defaultValue={student.birthDate} /></Field>
      <Field label="Giới tính"><select className="input" name="gender" defaultValue={student.gender ?? "Nam"}><option>Nam</option><option>Nữ</option><option>Khác</option></select></Field>
      <Field label="Số thứ tự *"><input className="input" name="ordinal" type="number" min="1" required defaultValue={student.ordinal ?? 1} /></Field>
      <Field label="Tổ"><select className="input" name="teamId" defaultValue={student.teamId ?? ""}><option value="">Chưa phân tổ</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    </div>
    {student.id && <Field label="Lý do chuyển tổ (nếu đổi tổ)"><input className="input" name="transferReason" placeholder="Ví dụ: Cân đối sĩ số các tổ" /></Field>}
    <Field label="Ghi chú cần lưu ý"><textarea className="input min-h-24" name="note" defaultValue={student.note ?? ""} placeholder="Chỉ giáo viên được xem ghi chú này" /></Field>
    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{state.error}</p>}
    {state?.ok && <p role="status" className="rounded-xl bg-green-50 p-3 text-green-700">Dữ liệu đã được lưu thành công.</p>}
    <div className="flex gap-3"><button disabled={pending} className="btn btn-primary">{pending ? "Đang lưu..." : "Lưu học sinh"}</button><Link href="/hoc-sinh" className="btn btn-soft">Hủy</Link></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block font-semibold">{label}</span>{children}</label>; }
