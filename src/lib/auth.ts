import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "development-only-secret-change-me");
export async function createSession(userId: string) { const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(key()); (await cookies()).set("cns_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 28800 }); }
export async function currentUser() { try { const token = (await cookies()).get("cns_session")?.value; if (!token) return null; const { payload } = await jwtVerify(token, key()); const user = await db.user.findUnique({ where: { id: String(payload.userId) } }); return user?.active ? user : null; } catch { return null; } }
export async function requireUser(options: { allowPasswordChange?: boolean } = {}) { if (!await db.user.findFirst({ where: { role: "SYSTEM_ADMIN" }, select: { id: true } })) redirect("/thiet-lap-ban-dau"); const user = await currentUser(); if (!user) redirect("/dang-nhap"); if (user.mustChangePassword && !options.allowPasswordChange) redirect("/tai-khoan-cua-toi?bat-buoc=1"); return user; }
export function isTeacher(role: string) { return role === "TEACHER" || role === "SYSTEM_ADMIN"; }
export async function requireTeacher() { const user = await requireUser(); if (!isTeacher(user.role)) redirect("/403"); return user; }
export async function requireSystemAdmin() { const user = await requireUser(); if (user.role !== "SYSTEM_ADMIN") redirect("/403"); return user; }