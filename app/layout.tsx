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
  title: "bokeh. Screen Recording Refined",
  description:
    "A macOS utility that automates the tedious parts of screen recording. Remove silence, smooth motion, and auto-zoom with ease.",
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

  openGraph: {
    title: "bokeh — Professional Screen Recording",
    description:
      "A macOS utility that cleans up screen recordings automatically. Record, polish, publish.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "bokeh — Professional Screen Recording",
    description:
      "A macOS utility that cleans up screen recordings automatically. Record, polish, publish.",
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
