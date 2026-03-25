import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Team",
  description: "Multi-agent coordination platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
