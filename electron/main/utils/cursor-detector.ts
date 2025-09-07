/**
 * Shared cursor detector module for handling native cursor detection
 * Used by both mouse-tracking.ts and caret-tracking.ts
 */

let cursorDetector: any = null
let isInitialized = false

/**
 * Initialize the cursor detector module (macOS only)
 * @param purpose - Description of what the cursor detector will be used for (for logging)
 * @returns The cursor detector instance or null if unavailable
 */
export function initializeCursorDetector(purpose: string = 'cursor detection'): any {
  if (isInitialized) {
    return cursorDetector
  }

  if (process.platform !== 'darwin') {
    console.log(`Platform is not macOS, cursor detector not available for ${purpose}`)
    return null
  }

  console.log(`Platform is macOS, attempting to load cursor detector for ${purpose}...`)

  try {
    // Webpack's node-loader will handle this static require and package the addon correctly
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cursorDetector = require('../../../build/Release/cursor_detector.node')
    console.log(`✅ Native cursor detector loaded successfully for ${purpose}`)
    isInitialized = true

    // Check if we have permissions on load
    checkAccessibilityPermissions(purpose)
    
    return cursorDetector
  } catch (error) {
    console.error(`Failed to load cursor detector for ${purpose}:`, error)
    return null
  }
}

/**
 * Check if we have accessibility permissions
 * @param purpose - Description of what permissions are needed for (for logging)
 * @returns true if permissions are granted, false otherwise
 */
export function checkAccessibilityPermissions(purpose: string = 'cursor detection'): boolean {
  if (!cursorDetector || !cursorDetector.hasAccessibilityPermissions) {
    return false
  }

  try {
    const hasPermissions = cursorDetector.hasAccessibilityPermissions()
    console.log(`Accessibility permissions for ${purpose}: ${hasPermissions ? '✅ Granted' : '❌ Not granted'}`)
    return hasPermissions
  } catch (error) {
    console.error(`Failed to check accessibility permissions for ${purpose}:`, error)
    return false
  }
}

