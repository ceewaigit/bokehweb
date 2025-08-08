import type { Metadata } from "next"
import { Inter } from "next/font/google"
import LayoutClient from "./layout-client"
import "./globals.css"

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "Screen Studio",
  description: "Professional screen recording and editing tool",
  icons: {
    icon: "/favicon.svg",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <LayoutClient>
          {children}
        </LayoutClient>
      </body>
    </html>
  )
}