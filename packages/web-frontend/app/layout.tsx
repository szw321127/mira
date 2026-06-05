import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RedNote 内容工坊",
  description: "把一句话生成可编辑大纲，并产出对应图文笔记。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
