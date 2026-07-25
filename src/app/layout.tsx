import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AutoApply — Otomatisasi Lamaran Kerja",
  description:
    "Upload screenshot lowongan, ekstrak info otomatis via AI, dan kirim email lamaran profesional dalam hitungan detik.",
  keywords: ["lamaran kerja", "otomatis", "AI", "email", "job application"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <div className="flex min-h-screen">
            <Navbar />
            <main className="flex-1 lg:ml-64">
              <div className="lg:p-0 pt-16 lg:pt-0">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
