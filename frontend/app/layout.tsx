import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuSense AI",
  description: "Document AI-likelihood analysis, RAG chat, and natural rewriting."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
