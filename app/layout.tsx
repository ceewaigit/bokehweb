import type { Metadata } from "next";
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
  title: "bokeh. — Screen Recording & Editing for Teams",
  description:
    "bokeh is a modern screen recording app with cursor focus, transcript editing, and clean exports for demos, tutorials, and team updates.",
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
    title: "bokeh — Screen Recording & Editing for Teams",
    description:
      "Modern screen recordings with cursor focus, transcript editing, and polished exports for demos, tutorials, and updates.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "bokeh — Screen Recording & Editing for Teams",
    description:
      "Modern screen recordings with cursor focus, transcript editing, and polished exports for demos, tutorials, and updates.",
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
      </body>
    </html>
  );
}
