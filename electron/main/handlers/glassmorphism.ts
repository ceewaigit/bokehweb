import { ipcMain, BrowserWindow } from 'electron'

export function registerGlassmorphismHandlers(): void {
  ipcMain.handle('update-glassmorphism', async (event, settings: any) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    // Apply window opacity based on the slider
    if (settings.opacity !== undefined) {
      // Convert 0-100 to 0.3-1.0 range (30% minimum for readability)
      const opacity = 0.3 + (settings.opacity / 100) * 0.7
      window.setOpacity(opacity)
    }
    
    return { success: true }
  })
}