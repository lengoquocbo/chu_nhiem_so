/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"), path = require("node:path");
const standalone = path.join(".next", "standalone"), packageFile = path.join(standalone, "package.json");
if (!fs.existsSync(packageFile)) { console.error("Chưa có production build. Hãy chạy npm run build trước."); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
if (pkg.scripts) for (const key of Object.keys(pkg.scripts)) if (key.includes("license:issuer") || String(pkg.scripts[key]).includes("license-issuer")) delete pkg.scripts[key];
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + "\n");
const forbiddenDirectories = [path.join(standalone, "tools", "license-issuer"), path.join(standalone, "test-results"), path.join(standalone, "e2e")];
for (const directory of forbiddenDirectories) fs.rmSync(directory, { recursive: true, force: true });
console.log("Đã chuẩn bị artifact khách hàng: loại bỏ script/công cụ issuer.");