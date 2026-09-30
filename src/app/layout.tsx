import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Healthy Food - POS & Stock Management",
  description: "Simple single-store healthy food POS counter and stock management system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className={`${GeistSans.className} antialiased selection:bg-primary/20 selection:text-primary`} suppressHydrationWarning>
        {children}
        <Toaster richColors position="top-right" />
        <SpeedInsights />
      </body>
    </html>
  );
}

