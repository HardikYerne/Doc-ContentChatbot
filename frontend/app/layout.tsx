import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuantumMines",
  description: "AI-powered document intelligence and RAG assistant",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}