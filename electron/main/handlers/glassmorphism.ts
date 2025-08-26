import { ipcMain, BrowserWindow } from 'electron'

export function registerGlassmorphismHandlers(): void {
  ipcMain.handle('update-glassmorphism', async (event, settings: any) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    // Apply window opacity to make the entire window translucent
    // This allows you to see through to whatever is behind the app
    if (settings.opacity !== undefined) {
      // Convert 0-100 to 0.5-1.0 range (50% minimum for readability)
      const opacity = 0.5 + (settings.opacity / 100) * 0.5
      window.setOpacity(opacity)
    }
    
    return { success: true }
  })
}