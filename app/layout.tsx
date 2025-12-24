import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "bokeh. Screen Recording That Just Works",
  description:
    "A macOS screen recording utility that removes dead time, smooths motion, and auto-zooms your recordings. Ship polished demos without the editing.",
  keywords: [
    "screen recorder",
    "screen recording",  
    "screen capture",
    "screen recording app",
    "video tutorials",
    "product demos",
    "transcript editing",
    "cursor smoothing",
    "video export",
  ],
  icons: {
    icon: "/brand/bokeh_logo.svg",
    apple: "/brand/bokeh_logo.svg",
    shortcut: "/brand/bokeh_logo.svg",
  },
  openGraph: {
    title: "bokeh — Screen Recording That Just Works",
    description:
      "A macOS utility that cleans up screen recordings automatically. Record, polish, ship.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "bokeh — Screen Recording That Just Works",
    description:
      "A macOS utility that cleans up screen recordings automatically. Record, polish, ship.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
