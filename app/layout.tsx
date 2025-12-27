import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { CustomCursor } from "@/components/ui/custom-cursor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased`}
      >
        {children}
        <CustomCursor />
        <Analytics />
      </body>
    </html>
  );
}
