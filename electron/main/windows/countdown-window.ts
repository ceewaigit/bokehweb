import { BrowserWindow, screen } from 'electron'
import * as path from 'path'

// Webpack entry points are set as environment variables by electron-forge

export function createCountdownWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const countdownWindow = new BrowserWindow({
    width: display.bounds.width,
    height: display.bounds.height,
    x: display.bounds.x,
    y: display.bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: process.env.MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY || path.join(__dirname, '../../preload.js')
    }
  })

  countdownWindow.setIgnoreMouseEvents(true)
  countdownWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  countdownWindow.setAlwaysOnTop(true, 'screen-saver', 1000)

  return countdownWindow
}

export function showCountdown(countdownWindow: BrowserWindow, number: number): void {
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
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
        }
        .countdown {
          font-size: 400px;
          font-weight: 700;
          color: white;
          text-shadow: 
            0 0 80px rgba(0, 0, 0, 0.9),
            0 0 120px rgba(0, 0, 0, 0.7),
            0 10px 40px rgba(0, 0, 0, 0.8);
          animation: smoothPulse 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, opacity;
          transform-origin: center;
        }
        @keyframes smoothPulse {
          0% { 
            transform: scale(0.3); 
            opacity: 0;
          }
          50% { 
            transform: scale(1.05);
            opacity: 0.9;
          }
          100% { 
            transform: scale(1); 
            opacity: 1;
          }
        }
      </style>
    </head>
    <body>
      <div class="countdown">${number || ''}</div>
    </body>
    </html>
  `

  countdownWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  countdownWindow.show()
}