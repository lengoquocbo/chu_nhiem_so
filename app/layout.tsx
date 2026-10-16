import { Inter, Lora } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin", "vietnamese"], variable: "--font-lora" });

export const metadata = {
  title: "Sổ điểm | Hệ thống quản lý lớp học",
  description: "Quản lý lớp học, điểm danh, thi đua",
};

const IGNORE_URBAN_VPN_ERROR_SCRIPT = `
  (() => {
    const extensionSource = "chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/";
    const comesFromUrbanVpn = (value) => typeof value === "string" && value.includes(extensionSource);
    const ignoreExtensionError = (event) => {
      const source = event.filename || event.error?.stack || "";
      if (!comesFromUrbanVpn(source)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("error", ignoreExtensionError, true);
    window.addEventListener("unhandledrejection", (event) => {
      if (!comesFromUrbanVpn(event.reason?.stack || event.reason?.message || "")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <Script id="ignore-urban-vpn-extension-error" strategy="beforeInteractive">{IGNORE_URBAN_VPN_ERROR_SCRIPT}</Script>
        {children}
      </body>
    </html>
  );
}
