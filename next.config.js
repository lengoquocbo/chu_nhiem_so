const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép CI/kiểm thử build dùng thư mục riêng khi `.next` đang được dev server giữ.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Vercel dùng `vercel.json`; khi chạy local, chuyển /api sang FastAPI.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return [
      {
        source: "/api/:path*",
        destination: `${pythonApiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
