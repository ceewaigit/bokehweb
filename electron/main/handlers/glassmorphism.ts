import { ipcMain, BrowserWindow } from 'electron'

export function registerGlassmorphismHandlers(): void {
  ipcMain.handle('update-glassmorphism', async (event, settings: any) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false }

    // Simple opacity control
    window.setOpacity(settings.opacity / 100)
    
    // Platform-specific effects (keep it simple)
    if (process.platform === 'darwin') {
      window.setVibrancy('under-window')
    } else if (process.platform === 'win32') {
      window.setBackgroundMaterial('acrylic')
    }
    
    return { success: true }
  })
}