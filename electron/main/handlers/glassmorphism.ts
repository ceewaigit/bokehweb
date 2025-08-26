import { ipcMain, BrowserWindow } from 'electron'

export function registerGlassmorphismHandlers(): void {
  ipcMain.handle('update-glassmorphism', async (event, settings: any) => {
    // Don't apply opacity to the entire window
    // The glassmorphism effect should only be on specific UI elements via CSS
    return { success: true }
  })
}