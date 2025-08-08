'use client'

import { Inter } from "next/font/google"
import { usePathname } from "next/navigation"
import { ErrorBoundary } from "@/components/error-boundary"
import { ToastContainer } from "@/components/toast"

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
})

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isRecordButton = pathname?.includes('/record-button')
  
  // For record button, use minimal transparent layout
  if (isRecordButton) {
    return (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backgroundColor: 'transparent'
      }}>
        {children}
      </div>
    )
  }
  
  // For main app, use full layout
  return (
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
  )
}