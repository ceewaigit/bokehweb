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

export class MemoryError extends Error {
  constructor(message: string, public memoryUsage?: number) {
    super(message)
    this.name = 'MemoryError'
  }
}

