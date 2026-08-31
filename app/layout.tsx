import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { SwRegister } from "@/components/pwa/sw-register";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Family Purse",
  description:
    "Shared family expense tracking — budgets, cards, loans and reports for everyone in the family.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Family Purse",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F4EE",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={figtree.variable} style={{ background: "#F7F4EE" }}>
        <div className="app-frame">{children}</div>
        <SwRegister />
      </body>
    </html>
  );
}