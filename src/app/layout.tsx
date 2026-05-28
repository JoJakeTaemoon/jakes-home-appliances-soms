import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seoul Aqua SOMS",
  description: "Seoul Aqua Service Operation Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Seoul Aqua",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/logo/seoul-aqua-logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0071BD",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout sits above the [locale] segment, so it can't access the URL
 * locale. We render a bare-bones HTML shell here and let
 * `app/[locale]/layout.tsx` wrap the providers + set the `lang` attribute
 * via LangSyncer.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
