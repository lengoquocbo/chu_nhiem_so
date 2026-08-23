"use server";
import { requireTeacher } from "@/lib/auth";
import { createDatabaseBackup } from "@/lib/backup";
import { db } from "@/lib/db";
export async function createBackupAction() { const user = await requireTeacher(); try { const backup = await createDatabaseBackup(); await db.auditLog.create({ data: { userId: user.id, action: "CREATE_DATABASE_BACKUP", entityType: "DatabaseBackup", entityId: backup.name, after: { size: backup.size, checksum: backup.checksum } } }); return { ok: true, message: "Đã tạo bản sao lưu an toàn." }; } catch { return { ok: false, message: "Không thể tạo bản sao lưu. Dữ liệu hiện tại không bị thay đổi." }; } }