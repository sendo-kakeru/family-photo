import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Family Photo",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={cn(
          "min-h-svh bg-white antialiased",
          inter.variable,
        )}
      >
        {/* TODO: 必要ならヘッダー設定。不要なら削除 */}
        <header></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
