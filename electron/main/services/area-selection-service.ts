import { BrowserWindow, screen, ipcMain } from 'electron'
import { getAppURL } from '../config'

interface AreaSelectionResult {
  success: boolean
  cancelled?: boolean
  error?: string
  area?: {
    x: number
    y: number
    width: number
    height: number
    displayId: number
  }
}

interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Service for handling screen area selection.
 * Creates a transparent fullscreen overlay for users to drag-select a region.
 * Follows the same patterns as monitor-overlay.ts for window management.
 */
class AreaSelectionService {
  private overlayWindow: BrowserWindow | null = null
  private resolvePromise: ((result: AreaSelectionResult) => void) | null = null
  private completeHandler: ((event: any, bounds: SelectionBounds) => void) | null = null
  private cancelHandler: (() => void) | null = null

  /**
   * Opens the area selection overlay and returns the selected region.
   * Returns a promise that resolves when selection is complete or cancelled.
   */
  async selectArea(): Promise<AreaSelectionResult> {
    // Check macOS version requirement (12.3+ for ScreenCaptureKit)
    if (!this.checkMacOSVersion()) {
      return { success: false, error: 'macOS 12.3+ required for area selection' }
    }

    // Cleanup any existing overlay (handles rapid re-selection)
    this.cleanup()

    return new Promise((resolve) => {
      this.resolvePromise = resolve
      this.createOverlay()
    })
  }

  /**
   * Checks if running on macOS 12.3 or later (required for ScreenCaptureKit).
   */
  private checkMacOSVersion(): boolean {
    if (process.platform !== 'darwin') {
      return true // Allow on non-macOS for development
    }

    const systemVersion = process.getSystemVersion?.() || '0.0.0'
    const [major, minor] = systemVersion.split('.').map(Number)

    if (major < 12 || (major === 12 && minor < 3)) {
      console.warn('[AreaSelection] Requires macOS 12.3+ for ScreenCaptureKit')
      return false
    }

    return true
  }

  /**
   * Creates the fullscreen transparent overlay window.
   */
  private createOverlay(): void {
    const primaryDisplay = screen.getPrimaryDisplay()

    // Get the correct preload path from webpack environment
    const preloadPath = process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY

    this.overlayWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath
      }
    })

    // Ensure visible on all workspaces and above everything
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

    this.setupEventListeners(primaryDisplay.id)
    this.loadContent()
  }

  /**
   * Sets up IPC listeners for selection completion/cancellation.
   */
  private setupEventListeners(displayId: number): void {
    if (!this.overlayWindow) return

    // Handle successful selection
    this.completeHandler = (_event: any, bounds: SelectionBounds) => {
      console.log('[AreaSelection] Selection complete:', bounds)
      this.resolvePromise?.({
        success: true,
        area: { ...bounds, displayId }
      })
      this.cleanup()
    }

    // Handle cancellation (Escape key or click outside)
    this.cancelHandler = () => {
      console.log('[AreaSelection] Selection cancelled')
      this.resolvePromise?.({
        success: false,
        cancelled: true
      })
      this.cleanup()
    }

    // Use once() to prevent listener accumulation
    ipcMain.once('area-selection-complete', this.completeHandler)
    ipcMain.once('area-selection-cancelled', this.cancelHandler)

    // Handle load failures
    this.overlayWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      console.error('[AreaSelection] Failed to load:', { errorCode, errorDescription, validatedURL })
      this.resolvePromise?.({
        success: false,
        error: `Failed to load area selection: ${errorDescription}`
      })
      this.cleanup()
    })

    this.overlayWindow.webContents.on('did-finish-load', () => {
      console.log('[AreaSelection] Content loaded successfully')
    })

    // Handle window being closed directly (e.g., by user or system)
    this.overlayWindow.on('closed', () => {
      // If closed without completion, resolve as cancelled
      if (this.resolvePromise) {
        console.log('[AreaSelection] Window closed without selection')
        this.resolvePromise({ success: false, cancelled: true })
        this.resolvePromise = null
      }
      this.removeListeners()
      this.overlayWindow = null
    })
  }

  /**
   * Loads the area selection React component.
   */
  private loadContent(): void {
    if (!this.overlayWindow) return

    const url = getAppURL('/area-selection')
    console.log('[AreaSelection] Loading URL:', url)

    this.overlayWindow.loadURL(url)

    // Show and focus when ready
    this.overlayWindow.once('ready-to-show', () => {
      console.log('[AreaSelection] Window ready to show')
      this.overlayWindow?.show()
      this.overlayWindow?.focus()
    })
  }

  /**
   * Removes IPC listeners if they haven't already been removed.
   */
  private removeListeners(): void {
    if (this.completeHandler) {
      ipcMain.removeListener('area-selection-complete', this.completeHandler)
      this.completeHandler = null
    }
    if (this.cancelHandler) {
      ipcMain.removeListener('area-selection-cancelled', this.cancelHandler)
      this.cancelHandler = null
    }
  }

  /**
   * Cleans up the overlay window and listeners.
   */
  private cleanup(): void {
    this.removeListeners()

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.close()
    }

    this.overlayWindow = null
    this.resolvePromise = null
  }
}

// Export singleton instance
export const areaSelectionService = new AreaSelectionService()
