/**
 * Custom error classes for better error handling
 * Replaces string-based error prefixes
 */

export class RecordingError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'RecordingError'
  }
}

export class PermissionError extends RecordingError {
  constructor(
    message: string,
    public permissionType: 'screen' | 'microphone' | 'camera' = 'screen',
    public requiresSystemSettings = false
  ) {
    super(message, 'PERMISSION_ERROR')
    this.name = 'PermissionError'
  }
}

export class ElectronError extends RecordingError {
  constructor(message: string, public electronAPIMethod?: string) {
    super(message, 'ELECTRON_ERROR')
    this.name = 'ElectronError'
  }
}

export class ExportError extends Error {
  constructor(
    message: string,
    public phase?: 'preparing' | 'processing' | 'encoding',
    public progress?: number
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

export class TimelineError extends Error {
  constructor(message: string, public clipId?: string) {
    super(message)
    this.name = 'TimelineError'
  }
}

export class MemoryError extends Error {
  constructor(message: string, public memoryUsage?: number) {
    super(message)
    this.name = 'MemoryError'
  }
}

// Error handler utility
export function isRecordingError(error: unknown): error is RecordingError {
  return error instanceof RecordingError
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof PermissionError) {
    if (error.requiresSystemSettings) {
      return `Permission required: Please enable ${error.permissionType} recording in System Preferences`
    }
    return `Permission denied for ${error.permissionType} access`
  }

  if (error instanceof ElectronError) {
    return `Desktop recording not available. Please ensure you're running the desktop app.`
  }

  if (error instanceof ExportError) {
    return `Export failed during ${error.phase || 'processing'}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unknown error occurred'
}