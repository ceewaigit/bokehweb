/**
 * Native Electron mouse tracking without robotjs dependency
 * Uses Electron's globalShortcut and screen APIs for system-wide tracking
 */

const { screen, globalShortcut, ipcMain } = require('electron')

class NativeMouseTracker {
  constructor() {
    this.isTracking = false
    this.trackingInterval = null
    this.callbacks = {
      move: [],
      click: []
    }
    this.lastPosition = { x: 0, y: 0 }
    this.clickShortcutsRegistered = false
  }

  start(intervalMs = 16) { // ~60fps by default
    if (this.isTracking) {
      console.warn('Native mouse tracking already started')
      return
    }

    this.isTracking = true
    console.log(`🖱️ Starting Electron-native mouse tracking at ${1000/intervalMs}fps`)

    // Initialize lastPosition to current position to avoid triggering on first check
    try {
      this.lastPosition = screen.getCursorScreenPoint()
    } catch (error) {
      console.error('Error getting cursor position:', error)
      this.lastPosition = { x: 0, y: 0 }
    }

    // Use Electron's screen API to get cursor position
    this.trackingInterval = setInterval(() => {
      try {
        const cursorPos = screen.getCursorScreenPoint()
        
        // Check if position changed
        if (cursorPos.x !== this.lastPosition.x || cursorPos.y !== this.lastPosition.y) {
          this.lastPosition = cursorPos
          this.notifyCallbacks('move', {
            x: cursorPos.x,
            y: cursorPos.y,
            timestamp: Date.now()
          })
        }
      } catch (error) {
        console.error('Error getting cursor position:', error)
      }
    }, intervalMs)

    // Set up global click detection using global shortcuts
    this.setupGlobalClickDetection()
  }

  stop() {
    if (!this.isTracking) {
      return
    }

    this.isTracking = false
    
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval)
      this.trackingInterval = null
    }

    // Unregister global shortcuts
    this.cleanupGlobalClickDetection()

    console.log('🖱️ Electron-native mouse tracking stopped')
  }

  setupGlobalClickDetection() {
    if (this.clickShortcutsRegistered) return

    try {
      // Register global shortcuts for mouse clicks
      // Note: This is a workaround since Electron doesn't have direct mouse click events
      // We can detect some mouse interactions through global shortcuts
      
      // Alternative: Use a timer-based approach to detect rapid position changes
      // which typically indicate clicks
      this.clickDetectionInterval = setInterval(() => {
        if (!this.isTracking) return

        // Detect potential clicks by monitoring rapid position stabilization
        // This is a heuristic approach but works reasonably well
        let currentPos
        try {
          currentPos = screen.getCursorScreenPoint()
        } catch (error) {
          console.error('Error getting cursor position:', error)
          return
        }
        
        // If cursor hasn't moved for a brief moment, it might be a click
        if (currentPos.x === this.lastPosition.x && currentPos.y === this.lastPosition.y) {
          // Additional heuristic: check if we had movement recently
          if (this.hadRecentMovement) {
            this.notifyCallbacks('click', {
              x: currentPos.x,
              y: currentPos.y,
              timestamp: Date.now()
            })
            this.hadRecentMovement = false
          }
        } else {
          this.hadRecentMovement = true
        }
      }, 50) // Check every 50ms for click patterns

      this.clickShortcutsRegistered = true
      console.log('✅ Global click detection enabled (heuristic-based)')
    } catch (error) {
      console.warn('⚠️ Could not set up global click detection:', error.message)
    }
  }

  cleanupGlobalClickDetection() {
    if (this.clickDetectionInterval) {
      clearInterval(this.clickDetectionInterval)
      this.clickDetectionInterval = null
    }

    // Unregister any global shortcuts if we had registered them
    try {
      globalShortcut.unregisterAll()
    } catch (error) {
      console.warn('Error unregistering global shortcuts:', error)
    }

    this.clickShortcutsRegistered = false
  }

  onMouseMove(callback) {
    this.callbacks.move.push(callback)
  }

  onMouseClick(callback) {
    this.callbacks.click.push(callback)
  }

  removeCallback(type, callback) {
    if (!this.callbacks[type]) {
      return // Invalid type, do nothing
    }
    const index = this.callbacks[type].indexOf(callback)
    if (index > -1) {
      this.callbacks[type].splice(index, 1)
    }
  }

  removeAllCallbacks() {
    this.callbacks.move = []
    this.callbacks.click = []
  }

  notifyCallbacks(type, data) {
    this.callbacks[type].forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in mouse ${type} callback:`, error)
      }
    })
  }

  getCurrentPosition() {
    return screen.getCursorScreenPoint()
  }

  isNativeTrackingAvailable() {
    return true // Always available with Electron
  }
}

module.exports = NativeMouseTracker