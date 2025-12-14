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
          {children}
        </div>
        <ToastContainer />
      </ErrorBoundary>
    </ThemeProvider>
  )
}
