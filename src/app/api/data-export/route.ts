import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStoredZip } from "@/lib/zip";
export const runtime = "nodejs";
const tables = ["School","SchoolYear","Semester","Classroom","Team","Student","Guardian","StudentGuardian","TeamTransferHistory","ClassTransferHistory","ClassMembership","ClassOfficerAppointment","RuleSet","RuleItem","CompetitionWeek","ClassSession","AttendanceRecord","CompetitionEvent","ScoreAdjustment","StudentWeeklyResult","Task","Notification","AuditLog"] as const;
const safe = (value: unknown): unknown => typeof value === "bigint" ? value.toString() : Buffer.isBuffer(value) ? value.toString("base64") : value instanceof Date ? value.toISOString() : value;
const json = (value: unknown) => JSON.stringify(value, (_, item) => safe(item), 2);
const csvCell = (value: unknown) => { const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${text.replaceAll('"', '""')}"`; };
export async function GET() {
  const user = await requireTeacher();
  const exported: Record<string, Record<string, unknown>[]> = {};
  let total = 0;
  for (const table of tables) { const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`); total += rows.length; if (total > 100_000) return new Response("Dữ liệu quá lớn để xuất trực tiếp. Vui lòng liên hệ quản trị viên.", { status: 413 }); exported[table] = rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safe(v)]))); }
  await db.auditLog.create({ data: { userId: user.id, action: "EXPORT_ALL_DATA", entityType: "Database", after: { recordCount: total, format: "ZIP_JSON_CSV_XLSX" } } });
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Chủ Nhiệm Số"; workbook.created = new Date();
  const entries: { name: string; data: Buffer }[] = [];
  for (const [table, rows] of Object.entries(exported)) { const body = Buffer.from(json(rows), "utf8"); entries.push({ name: `json/${table}.json`, data: body }); const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row)))); const csv = [columns.map(csvCell).join(","), ...rows.map(row => columns.map(c => csvCell(row[c])).join(","))].join("\r\n"); entries.push({ name: `csv/${table}.csv`, data: Buffer.from(`\ufeff${csv}`, "utf8") }); const sheet = workbook.addWorksheet(table.slice(0, 31)); sheet.columns = columns.map(key => ({ header: key, key, width: 20 })); rows.forEach(row => sheet.addRow(row)); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }]; }
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer()); entries.push({ name: "du-lieu-chu-nhiem-so.xlsx", data: xlsx });
  const manifestFiles = entries.map(entry => ({ path: entry.name, size: entry.data.length, sha256: createHash("sha256").update(entry.data).digest("hex") })); const manifest = { product: "CHỦ NHIỆM SỐ", exportedAt: new Date().toISOString(), exportedBy: user.id, recordCount: total, files: manifestFiles }; entries.push({ name: "manifest.json", data: Buffer.from(json(manifest), "utf8") });
  const zip = createStoredZip(entries); const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new Response(zip, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="chu-nhiem-so-data-${date}.zip"`, "Cache-Control": "no-store" } });
}