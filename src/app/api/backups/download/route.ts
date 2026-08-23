import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBackupDirectory, isSafeBackupName } from "@/lib/backup";
export const runtime = "nodejs";
export async function GET(request: Request) { const user = await requireTeacher(); const name = new URL(request.url).searchParams.get("name") || ""; if (!isSafeBackupName(name)) return new Response("Tệp sao lưu không hợp lệ.", { status: 400 }); try { const content = await readFile(join(getBackupDirectory(), name)); await db.auditLog.create({ data: { userId: user.id, action: "DOWNLOAD_DATABASE_BACKUP", entityType: "DatabaseBackup", entityId: name } }); return new Response(content, { headers: { "Content-Type": "application/vnd.sqlite3", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } }); } catch { return new Response("Không tìm thấy bản sao lưu.", { status: 404 }); } }