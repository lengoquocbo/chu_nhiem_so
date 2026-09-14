import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

const root = process.cwd();
const isWindows = process.platform === "win32";
const venvPython = resolve(root, ".venv", isWindows ? "Scripts/python.exe" : "bin/python");
const python = process.env.PYTHON || (existsSync(venvPython) ? venvPython : isWindows ? "python" : "python3");
const webPort = process.env.PORT || "3000";
const apiPort = process.env.PYTHON_API_PORT || "8000";
const environment = {
  ...process.env,
  PYTHON_API_URL: process.env.PYTHON_API_URL || `http://127.0.0.1:${apiPort}`,
};

function assertPortAvailable(port, serviceName) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Cổng ${port} dành cho ${serviceName} đang được sử dụng. Hãy dừng server cũ rồi chạy lại.`));
        return;
      }
      reject(error);
    });
    server.listen(Number(port), () => server.close(resolvePromise));
  });
}

try {
  await assertPortAvailable(webPort, "Next.js");
  await assertPortAvailable(apiPort, "FastAPI");
} catch (error) {
  console.error(`\nKhông thể khởi động development: ${error.message}\n`);
  process.exit(1);
}

const processes = [
  spawn(
    process.execPath,
    [resolve(root, "node_modules/next/dist/bin/next"), "dev", "-p", webPort],
    { cwd: root, env: environment, stdio: "inherit" },
  ),
  spawn(
    python,
    ["-m", "uvicorn", "index:app", "--app-dir", "api", "--reload", "--port", apiPort],
    { cwd: root, env: environment, stdio: "inherit" },
  ),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode !== null || !child.pid) continue;
    if (isWindows) {
      // `uvicorn --reload` và Next.js đều tạo process con. taskkill /T đảm bảo
      // Ctrl+C không để lại process mồ côi giữ cổng 3000/8000 trên Windows.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  }
  process.exit(exitCode);
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error(`Không thể khởi động tiến trình development: ${error.message}`);
    if (error.code === "ENOENT") {
      console.error("Hãy chạy `npm run setup:api` một lần để cài môi trường Python.");
    }
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
