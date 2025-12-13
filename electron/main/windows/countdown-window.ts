import { BrowserWindow, screen } from 'electron'
import * as path from 'path'

// Webpack entry points are set as environment variables by electron-forge

export function createCountdownWindow(displayId?: number): BrowserWindow {
  // Get the target display - use provided displayId or fall back to primary
  const displays = screen.getAllDisplays()
  const display = displayId
    ? displays.find(d => d.id === displayId) || screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay()

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
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
        }
        
        .countdown-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        
        /* Outer glow ring */
        .glow-ring {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            rgba(168, 85, 247, 0.4),
            rgba(139, 92, 246, 0.6),
            rgba(168, 85, 247, 0.4),
            rgba(99, 102, 241, 0.3),
            rgba(168, 85, 247, 0.4)
          );
          filter: blur(40px);
          animation: glowPulse 2s ease-in-out infinite, slowRotate 8s linear infinite;
          opacity: 0.8;
        }
        
        /* Glass circle background */
        .glass-circle {
          position: absolute;
          width: 240px;
          height: 240px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(40px);
          -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 
            0 0 80px rgba(139, 92, 246, 0.2),
            inset 0 0 60px rgba(255, 255, 255, 0.02);
        }
        
        /* Progress ring */
        .progress-ring {
          position: absolute;
          width: 260px;
          height: 260px;
        }
        
        .progress-ring-background {
          fill: none;
          stroke: rgba(255, 255, 255, 0.08);
          stroke-width: 3;
        }
        
        .progress-ring-progress {
          fill: none;
          stroke: url(#progressGradient);
          stroke-width: 3;
          stroke-linecap: round;
          stroke-dasharray: 753.98;
          stroke-dashoffset: 0;
          transform-origin: center;
          transform: rotate(-90deg);
          animation: progressDraw 1s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.5));
        }
        
        /* The number */
        .countdown {
          position: relative;
          font-size: 160px;
          font-weight: 200;
          letter-spacing: -8px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 1) 0%,
            rgba(255, 255, 255, 0.8) 50%,
            rgba(200, 180, 255, 0.9) 100%
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: numberReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          text-shadow: none;
          filter: drop-shadow(0 4px 20px rgba(139, 92, 246, 0.3));
        }
        
        /* Subtle label */
        .label {
          position: absolute;
          bottom: -80px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          animation: labelFade 0.8s ease-out 0.2s both;
        }
        
        /* Decorative dots */
        .dot {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(168, 85, 247, 0.6);
          animation: dotPulse 1.5s ease-in-out infinite;
        }
        
        .dot-1 { top: -40px; left: 50%; transform: translateX(-50%); animation-delay: 0s; }
        .dot-2 { bottom: -40px; left: 50%; transform: translateX(-50%); animation-delay: 0.5s; }
        .dot-3 { left: -40px; top: 50%; transform: translateY(-50%); animation-delay: 0.25s; }
        .dot-4 { right: -40px; top: 50%; transform: translateY(-50%); animation-delay: 0.75s; }
        
        @keyframes numberReveal {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(20px);
            filter: blur(10px) drop-shadow(0 4px 20px rgba(139, 92, 246, 0.3));
          }
          60% {
            opacity: 1;
            transform: scale(1.02) translateY(-2px);
            filter: blur(0) drop-shadow(0 4px 20px rgba(139, 92, 246, 0.3));
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
            filter: blur(0) drop-shadow(0 4px 20px rgba(139, 92, 246, 0.3));
          }
        }
        
        @keyframes glowPulse {
          0%, 100% { 
            opacity: 0.6;
            transform: scale(1);
          }
          50% { 
            opacity: 0.9;
            transform: scale(1.05);
          }
        }
        
        @keyframes slowRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes progressDraw {
          from { stroke-dashoffset: 753.98; }
          to { stroke-dashoffset: 0; }
        }
        
        @keyframes labelFade {
          from { 
            opacity: 0;
            transform: translateY(10px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes dotPulse {
          0%, 100% { 
            opacity: 0.3;
            transform: translateX(-50%) scale(1);
          }
          50% { 
            opacity: 0.8;
            transform: translateX(-50%) scale(1.5);
          }
        }
        
        .dot-3, .dot-4 {
          animation-name: dotPulseY;
        }
        
        @keyframes dotPulseY {
          0%, 100% { 
            opacity: 0.3;
            transform: translateY(-50%) scale(1);
          }
          50% { 
            opacity: 0.8;
            transform: translateY(-50%) scale(1.5);
          }
        }
      </style>
    </head>
    <body>
      <div class="countdown-container">
        <div class="glow-ring"></div>
        <div class="glass-circle"></div>
        
        <!-- Progress ring SVG -->
        <svg class="progress-ring" viewBox="0 0 260 260">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color: #a855f7" />
              <stop offset="50%" style="stop-color: #8b5cf6" />
              <stop offset="100%" style="stop-color: #6366f1" />
            </linearGradient>
          </defs>
          <circle class="progress-ring-background" cx="130" cy="130" r="120" />
          <circle class="progress-ring-progress" cx="130" cy="130" r="120" />
        </svg>
        
        <div class="countdown">${number || ''}</div>
        
        <div class="dot dot-1"></div>
        <div class="dot dot-2"></div>
        <div class="dot dot-3"></div>
        <div class="dot dot-4"></div>
        
        <div class="label">Recording starts</div>
      </div>
    </body>
    </html>
  `

  countdownWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  countdownWindow.show()
}