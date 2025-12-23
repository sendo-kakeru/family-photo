import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { Header } from "@/components/Header";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  description: "",
  title: "Family Photo",
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
          "mx-auto min-h-svh max-w-[1056px] bg-white px-4 pt-4 antialiased",
          inter.variable,
        )}
      >
        <NuqsAdapter>
          <Header />
          <main className="grid h-full">{children}</main>
        </NuqsAdapter>
      </body>
    </html>
  );
}
