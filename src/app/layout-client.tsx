'use client'

import { useEffect } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { ToastContainer } from "@/components/toast"
import { RecordingStorage } from "@/lib/storage/recording-storage"
import { ThemeProvider } from "@/contexts/theme-context"

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  // Clear invalid blob URLs on app startup
  useEffect(() => {
    // Only run once on initial mount
    RecordingStorage.clearAllBlobUrls()
  }, [])
  
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <div className="h-screen w-screen overflow-hidden">
          {/* Electron title bar spacer */}
          <div className="h-10 w-full backdrop-blur-sm border-b border-border/50 flex items-center justify-center drag-region">
            <div className="text-sm font-medium text-muted-foreground">Screen Recorder</div>
          </div>
          <div className="h-[calc(100vh-2.5rem)] w-full overflow-hidden">
            {children}
          </div>
        </div>
        <ToastContainer />
      </ErrorBoundary>
    </ThemeProvider>
  )
}