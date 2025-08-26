import { ipcMain, BrowserWindow } from 'electron'

export function registerGlassmorphismHandlers(): void {
  ipcMain.handle('update-glassmorphism', async (event, settings: any) => {
    // The opacity is now controlled via CSS variables for the background
    // This keeps text fully opaque while only the background is translucent
    // Similar to how Warp terminal works
    
    return { success: true }
  })
}