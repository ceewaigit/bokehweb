import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ErrorBoundary } from "@/components/error-boundary"
import { ToastContainer } from "@/components/toast"
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
        <ErrorBoundary>
          <div className="h-screen w-screen overflow-hidden bg-background">
            {/* Electron title bar spacer */}
            <div className="h-10 w-full bg-background/80 backdrop-blur-sm border-b border-border/50 flex items-center justify-center drag-region">
              <div className="text-sm font-medium text-muted-foreground">Screen Studio Pro</div>
            </div>
            <div className="h-[calc(100vh-2.5rem)] w-full overflow-hidden">
              {children}
            </div>
          </div>
          <ToastContainer />
        </ErrorBoundary>
      </body>
    </html>
  )
}