/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"), path = require("node:path");
const roots = [path.join(".next", "standalone"), path.join(".next", "static")].filter(fs.existsSync), bad = [];
if (!roots.length) { console.error("Không tìm thấy artifact khách hàng. Hãy chạy build và prepare:customer-build."); process.exit(1); }
const forbidden = ["-----BEGIN PRIVATE KEY-----", "chu-nhiem-so-private.pem", "license-issuer-gui.ps1", "tools/license-issuer", "tools\\license-issuer"];
function walk(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) walk(file); else { let bytes; try { bytes = fs.readFileSync(file); } catch { continue; } for (const marker of forbidden) if (bytes.includes(Buffer.from(marker))) bad.push(`${file}: ${marker}`); } } }
roots.forEach(walk);
if (bad.length) { console.error("Artifact khách hàng chứa private key, đường dẫn khóa hoặc công cụ issuer:\n" + bad.join("\n")); process.exit(1); }
console.log("Customer artifact secret/issuer scan: PASS");