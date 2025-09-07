import { BrowserWindow, screen, Display } from 'electron'
import * as path from 'path'

let overlayWindow: BrowserWindow | null = null

export function createMonitorOverlay(displayId?: number): BrowserWindow {
  // Get the target display
  const displays = screen.getAllDisplays()
  const targetDisplay = displayId 
    ? displays.find(d => d.id === displayId) 
    : screen.getPrimaryDisplay()
  
  if (!targetDisplay) {
    throw new Error(`Display with ID ${displayId} not found`)
  }

  // Destroy existing overlay if any
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }

  // Create overlay window covering the entire display
  overlayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js')
    }
  })

  // Make it ignore mouse events so user can still interact with screen
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

  return overlayWindow
}

export function showMonitorOverlay(displayId?: number): void {
  const overlay = createMonitorOverlay(displayId)
  
  // Get display info for the overlay
  const displays = screen.getAllDisplays()
  const targetDisplay = displayId 
    ? displays.find(d => d.id === displayId) 
    : screen.getPrimaryDisplay()
  
  const displayName = getDisplayName(targetDisplay)
  
  // Glassmorphic overlay HTML with beautiful design
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box;
        }
        html, body {
          background: transparent;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
          position: relative;
        }
        
        /* Glassmorphic border */
        .border-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          animation: fadeIn 0.3s ease-out;
        }
        
        /* Create border using pseudo elements for better performance */
        .border-overlay::before {
          content: '';
          position: absolute;
          inset: 20px;
          border: 3px solid rgba(255, 255, 255, 0.5);
          border-radius: 24px;
          background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.05) 100%);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.2) inset,
            0 20px 40px rgba(0, 0, 0, 0.3),
            0 0 80px rgba(59, 130, 246, 0.3),
            0 0 120px rgba(59, 130, 246, 0.2);
        }
        
        /* Corner accents */
        .corner {
          position: absolute;
          width: 40px;
          height: 40px;
          border: 3px solid rgba(59, 130, 246, 0.8);
        }
        
        .corner.top-left {
          top: 15px;
          left: 15px;
          border-right: none;
          border-bottom: none;
          border-top-left-radius: 24px;
        }
        
        .corner.top-right {
          top: 15px;
          right: 15px;
          border-left: none;
          border-bottom: none;
          border-top-right-radius: 24px;
        }
        
        .corner.bottom-left {
          bottom: 15px;
          left: 15px;
          border-right: none;
          border-top: none;
          border-bottom-left-radius: 24px;
        }
        
        .corner.bottom-right {
          bottom: 15px;
          right: 15px;
          border-left: none;
          border-top: none;
          border-bottom-right-radius: 24px;
        }
        
        /* Center label */
        .label-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
          animation: slideUp 0.5s ease-out;
        }
        
        .label {
          background: linear-gradient(135deg,
            rgba(59, 130, 246, 0.95) 0%,
            rgba(147, 51, 234, 0.95) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 20px 40px;
          border-radius: 100px;
          box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.3),
            0 0 60px rgba(59, 130, 246, 0.4),
            inset 0 1px rgba(255, 255, 255, 0.3),
            inset 0 -1px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .label-text {
          color: white;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .label-subtitle {
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          font-weight: 500;
          margin-top: 4px;
          text-align: center;
        }
        
        /* Recording indicator */
        .recording-indicator {
          position: absolute;
          top: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 12px 24px;
          border-radius: 100px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .recording-dot {
          width: 12px;
          height: 12px;
          background: #ef4444;
          border-radius: 50%;
          animation: pulse 2s infinite;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
        }
        
        .recording-text {
          color: white;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translate(-50%, -40%);
          }
          to { 
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        
        @keyframes pulse {
          0%, 100% { 
            opacity: 1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.7;
            transform: scale(1.1);
          }
        }
      </style>
    </head>
    <body>
      <div class="border-overlay">
        <!-- Corner accents -->
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>
      </div>
      
      <div class="recording-indicator">
        <div class="recording-dot"></div>
        <div class="recording-text">Ready to Record</div>
      </div>
      
      <div class="label-container">
        <div class="label">
          <div class="label-text">Recording ${displayName}</div>
          <div class="label-subtitle">Click "Start Recording" to begin</div>
        </div>
      </div>
    </body>
    </html>
  `
  
  overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  overlay.show()
}

export function hideMonitorOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
}

function getDisplayName(display: Display | undefined): string {
  if (!display) return 'Display'
  
  // Check if it's the primary display
  const primary = screen.getPrimaryDisplay()
  if (display.id === primary.id) {
    return 'Primary Display'
  }
  
  // Check if it's internal (laptop screen)
  if (display.internal) {
    return 'Built-in Display'
  }
  
  // Get all displays and find index
  const displays = screen.getAllDisplays()
  const index = displays.findIndex(d => d.id === display.id)
  
  if (index !== -1) {
    return `Display ${index + 1}`
  }
  
  return 'External Display'
}