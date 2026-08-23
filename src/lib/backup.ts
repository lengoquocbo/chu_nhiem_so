import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { db } from "./db";
import { getLicenseDataDirectory } from "./license/storage";
const BACKUP_PATTERN = /^chu-nhiem-so-\d{8}-\d{6}\.db$/;
export const getBackupDirectory = () => process.env.CHU_NHIEM_SO_BACKUP_DIR || join(getLicenseDataDirectory(), "backups");
const stamp = (date = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date).replace(/[-: ]/g, "").replace(/^(\d{8})(\d{6})$/, "$1-$2");
export const isSafeBackupName = (name: string) => BACKUP_PATTERN.test(name) && basename(name) === name;
export async function sha256File(path: string) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
export async function createDatabaseBackup() { const directory = getBackupDirectory(); await mkdir(directory, { recursive: true }); const name = `chu-nhiem-so-${stamp()}.db`; const path = join(directory, name); if (path.includes("'")) throw new Error("Đường dẫn sao lưu không hợp lệ."); await db.$executeRawUnsafe(`VACUUM INTO '${path.replaceAll("\\", "/")}'`); const info = await stat(path); if (info.size < 100) throw new Error("Bản sao lưu không hợp lệ."); return { name, path, size: info.size, checksum: await sha256File(path), createdAt: info.birthtime }; }
export async function listDatabaseBackups() { const directory = getBackupDirectory(); await mkdir(directory, { recursive: true }); const names = (await readdir(/* turbopackIgnore: true */ directory)).filter(isSafeBackupName).sort().reverse(); return Promise.all(names.map(async name => { const path = join(directory, name); const info = await stat(path); return { name, path, size: info.size, createdAt: info.birthtime, checksum: await sha256File(path) }; })); }