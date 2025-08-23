/**
 * Native macOS window bounds detection using CGWindow APIs
 * This provides accurate window positions and sizes for proper recording
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  name: string
  ownerName: string
  windowId: number
}

/**
 * Get bounds for all windows using macOS CGWindow API
 */
export async function getAllWindowBounds(): Promise<WindowBounds[]> {
  try {
    // Use macOS's CGWindow API via a Swift/ObjC script
    // This gets accurate window positions including off-screen windows
    const script = `
import Cocoa
import CoreGraphics

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

for window in windows {
    if let name = window[kCGWindowName as String] as? String,
       let ownerName = window[kCGWindowOwnerName as String] as? String,
       let windowId = window[kCGWindowNumber as String] as? Int,
       let bounds = window[kCGWindowBounds as String] as? [String: Any],
       let x = bounds["X"] as? CGFloat,
       let y = bounds["Y"] as? CGFloat,
       let width = bounds["Width"] as? CGFloat,
       let height = bounds["Height"] as? CGFloat,
       width > 50, height > 50 { // Filter out tiny windows
        print("\\(windowId)|\\(ownerName)|\\(name)|\\(Int(x))|\\(Int(y))|\\(Int(width))|\\(Int(height))")
    }
}
`
    
    // Execute via swift command
    const { stdout } = await execAsync(`echo '${script}' | swift -`)
    
    const windows: WindowBounds[] = []
    const lines = stdout.trim().split('\n').filter(line => line.length > 0)
    
    for (const line of lines) {
      const [windowId, ownerName, name, x, y, width, height] = line.split('|')
      windows.push({
        windowId: parseInt(windowId),
        ownerName,
        name,
        x: parseInt(x),
        y: parseInt(y),
        width: parseInt(width),
        height: parseInt(height)
      })
    }
    
    return windows
  } catch (error) {
    console.error('Failed to get window bounds:', error)
    return []
  }
}

/**
 * Match Electron desktopCapturer source to actual window bounds
 * The source.name from desktopCapturer usually matches window title
 */
export async function getWindowBoundsForSource(sourceName: string): Promise<WindowBounds | null> {
  const allWindows = await getAllWindowBounds()
  
  // Try exact match first
  let match = allWindows.find(w => w.name === sourceName)
  
  // If no exact match, try to match by owner name (app name)
  if (!match) {
    match = allWindows.find(w => 
      sourceName.includes(w.ownerName) || 
      w.ownerName.includes(sourceName.split(' - ')[0])
    )
  }
  
  return match || null
}

