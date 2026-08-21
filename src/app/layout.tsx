import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RAS — نظام إدارة رسالة",
    template: "%s | RAS",
  },
  description:
    "Resala Administration System — منصة إدارة المتطوعين والقوافل الطبية لفريق قوافل طبية",
  manifest: "/manifest.webmanifest",
  applicationName: "RAS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RAS",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} antialiased`}>{children}</body>
    </html>
  );
}
