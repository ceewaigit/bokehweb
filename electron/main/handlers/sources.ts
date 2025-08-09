import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent } from 'electron'
import { exec } from 'child_process'

interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

interface MediaConstraints {
  audio: boolean | { mandatory: { chromeMediaSource: string } }
  video: {
    mandatory: {
      chromeMediaSource: string
      chromeMediaSourceId: string
    }
  }
}

export function registerSourceHandlers(): void {

  // CRITICAL FIX: Return constraints that work with all Electron versions
  ipcMain.handle('get-desktop-stream', async (event: IpcMainInvokeEvent, sourceId: string, hasAudio: boolean = false): Promise<MediaConstraints> => {
    try {
      console.log('🎥 Creating desktop stream for source:', sourceId, 'with audio:', hasAudio)

      // This format works universally across Electron versions
      const constraints: MediaConstraints = {
        audio: hasAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        } : false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      }

      console.log('✅ Returning constraints:', JSON.stringify(constraints, null, 2))
      return constraints
    } catch (error) {
      console.error('❌ Failed to create stream constraints:', error)
      throw error
    }
  })

  ipcMain.handle('get-desktop-sources', async (event: IpcMainInvokeEvent, options: DesktopSourceOptions = {}) => {
    try {
      // Check permissions on macOS
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus('screen')
        console.log('🔍 Screen recording permission check:', status)

        if (status !== 'granted') {
          const parentWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()

          if (parentWindow) {
            const result = await dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Screen Recording Permission Required',
              message: 'Screen Studio needs permission to record your screen.',
              detail: 'To enable screen recording:\n\n1. Open System Preferences\n2. Go to Security & Privacy > Privacy\n3. Select Screen Recording\n4. Check the box next to Screen Studio\n5. Restart Screen Studio\n\nClick "Open System Preferences" to go there now.',
              buttons: ['Open System Preferences', 'Cancel'],
              defaultId: 0,
              cancelId: 1
            })

            if (result.response === 0) {
              exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            }
          }

          const permissionError: any = new Error('Screen recording permission denied')
          permissionError.code = 'PERMISSION_DENIED'
          throw permissionError
        }
      }

      // WORKAROUND: Return hardcoded screen source to avoid desktopCapturer IPC bug
      // The actual screen ID will be determined when getUserMedia is called
      console.log('🎥 Bypassing desktopCapturer due to IPC bug - returning hardcoded screen source')

      // Get the primary display info
      const primaryDisplay = screen.getPrimaryDisplay()
      const allDisplays = screen.getAllDisplays()

      // Return hardcoded sources based on available displays
      const mappedSources = allDisplays.map((display, index) => ({
        id: `screen:${display.id}:0`,
        name: index === 0 ? 'Entire screen' : `Screen ${index + 1}`,
        display_id: display.id
      }))

      console.log('📺 Returning screen sources:', mappedSources.map(s => `${s.name} (${s.id})`))
      return mappedSources

    } catch (error: any) {
      console.error('❌ Error getting desktop sources:', error)

      if (error?.message?.includes('Failed to get sources') || !error?.message) {
        const permissionError: any = new Error(
          'Screen recording permission required. Please go to System Preferences > Security & Privacy > Privacy > Screen Recording and enable access for this app.'
        )
        permissionError.code = 'PERMISSION_DENIED'
        throw permissionError
      }
      throw error
    }
  })

  ipcMain.handle('get-screens', async () => {
    return screen.getAllDisplays().map(display => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal
    }))
  })

  ipcMain.handle('get-platform', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.getSystemVersion?.() || 'unknown'
    }
  })
}