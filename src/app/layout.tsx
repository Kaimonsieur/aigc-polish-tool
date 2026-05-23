import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "论文降AIGC",
  description: "支持文本粘贴和 Word/PDF 上传的论文降AIGC、文本润色和自然化改写工具。",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
