/* eslint-disable @typescript-eslint/no-require-imports */
const { copyFile, mkdtemp, readdir, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const hash = async p => createHash("sha256").update(await readFile(p)).digest("hex");
(async () => { const dir = await mkdtemp(join(tmpdir(), "cns-restore-drill-")); try { const source = resolve("prisma/dev.db"); const backup = join(dir, "backup.db"); const target = join(dir, "target.db"); await copyFile(source, backup); await copyFile(source, target); const run = spawnSync(process.execPath, ["tools/restore-backup.cjs", "--file", backup, "--database", target, "--confirm", "KHOI-PHUC"], { encoding: "utf8" }); if (run.status !== 0) throw new Error(run.stderr || run.stdout); if (await hash(backup) !== await hash(target)) throw new Error("Checksum sau khôi phục không khớp."); const files = await readdir(dir); if (!files.some(x => x.includes("before-restore"))) throw new Error("Thiếu bản sao an toàn trước khôi phục."); console.log("Backup/restore drill: PASS"); } finally { await rm(dir, { recursive: true, force: true }); } })().catch(e => { console.error(e.message); process.exit(1); });