import type {Metadata} from"next";import"./globals.css";
export const metadata:Metadata={title:"Chủ Nhiệm Số",description:"Không gian quản lý lớp học tích cực dành cho giáo viên Việt Nam"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
