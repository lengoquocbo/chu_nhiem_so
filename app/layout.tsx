import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin", "vietnamese"], variable: "--font-lora" });

export const metadata = {
  title: "Sổ điểm | Hệ thống quản lý lớp học",
  description: "Quản lý lớp học, điểm danh, thi đua",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
