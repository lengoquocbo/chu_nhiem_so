#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { copyFile, mkdir, readFile, rename, stat, unlink } = require("node:fs/promises");
const { basename, dirname, resolve } = require("node:path");
const { createHash } = require("node:crypto");
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function validSqlite(path) { const file = await readFile(path); return file.length > 100 && file.subarray(0, 16).toString("ascii") === "SQLite format 3\0"; }
async function hash(path) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
async function main() {
  const source = resolve(arg("--file") || "");
  const database = resolve(arg("--database") || resolve(process.cwd(), "prisma", "dev.db"));
  if (arg("--confirm") !== "KHOI-PHUC") throw new Error("Thiếu xác nhận --confirm KHOI-PHUC.");
  if (source === database) throw new Error("Tệp sao lưu và database hiện tại không được trùng nhau.");
  if (!(await validSqlite(source))) throw new Error("Tệp được chọn không phải database SQLite hợp lệ.");
  await stat(database);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safety = `${database}.before-restore-${stamp}.bak`;
  const temporary = `${database}.restore-tmp`;
  const rollback = `${database}.restore-rollback`;
  await mkdir(dirname(database), { recursive: true });
  await copyFile(database, safety);
  await copyFile(source, temporary);
  if (!(await validSqlite(temporary))) throw new Error("Bản sao tạm không hợp lệ.");
  await rename(database, rollback);
  try { await rename(temporary, database); await unlink(rollback); }
  catch (error) { await rename(rollback, database).catch(() => {}); await unlink(temporary).catch(() => {}); throw error; }
  console.log(JSON.stringify({ ok: true, database, source: basename(source), safetyBackup: safety, checksum: await hash(database) }, null, 2));
}
main().catch(error => { console.error(`Khôi phục thất bại: ${error.message}`); process.exitCode = 1; });