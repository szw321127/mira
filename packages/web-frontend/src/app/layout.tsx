import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mira Agent",
  description: "Talk with Mira to shape Xiaohongshu content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
