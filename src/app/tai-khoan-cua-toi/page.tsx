import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { MyAccountForm } from "./my-account-form";
export default async function Page() { const user = await requireUser({ allowPasswordChange: true }); return <Shell user={user}><h1 className="text-3xl font-extrabold">Tài khoản của tôi</h1><p className="mt-2 text-slate-500">Đổi họ tên, tên đăng nhập/email và mật khẩu.</p><MyAccountForm user={user} /></Shell>; }