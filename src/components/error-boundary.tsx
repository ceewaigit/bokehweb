"use client"

import React from 'react'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state
      const CustomFallback = this.props.fallback

      if (CustomFallback) {
        return <CustomFallback error={error!} retry={() => this.setState({ hasError: false })} />
      }

      return <DefaultErrorFallback error={error!} retry={() => this.setState({ hasError: false })} />
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  const handleReload = () => {
    window.location.reload()
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="max-w-md mx-auto text-center p-6">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. This might be due to a temporary issue.
        </p>
        
        <div className="space-y-2 mb-6">
          <Button onClick={retry} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" onClick={handleReload} className="w-full">
            <Home className="w-4 h-4 mr-2" />
            Reload App
          </Button>
        </div>
        
        <details className="text-left">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            Error Details
          </summary>
          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-32">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      </div>
    </div>
  )
}

// Hook for error handling in functional components
export function useErrorHandler() {
  const handleError = (error: Error, errorInfo?: string) => {
    console.error('Error caught by useErrorHandler:', error, errorInfo)
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error)
    }
  }

  return handleError
}