/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"), path = require("node:path");
const roots = ["src", "messages", "prisma", "docs", "e2e", "scripts", "tools"].filter(fs.existsSync);
const extensions = new Set([".ts", ".tsx", ".js", ".cjs", ".json", ".md", ".prisma"]);
const patterns = [[0xfffd], [0xef,0xbf,0xbd], [0xc3], [0xc2], [0xc4], [0xe1,0xbb], [0xe1,0xba]].map(points => new RegExp(String.fromCodePoint(...points), "u"));
const bad = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) { if (!["backups", "migrations"].includes(entry.name)) walk(file); } else if (extensions.has(path.extname(entry.name))) { const bytes = fs.readFileSync(file); if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bad.push(`${file}: UTF-8 BOM`); const text = bytes.toString("utf8"); text.split(/\r?\n/).forEach((line, index) => { if (patterns.some(pattern => pattern.test(line))) bad.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`); }); } } }
roots.forEach(walk);
if (bad.length) { console.error(`Đã phát hiện ${bad.length} lỗi hoặc dấu hiệu mã hóa sai:\n${bad.join("\n")}`); process.exit(1); }
console.log("Encoding UTF-8 toàn dự án: PASS");