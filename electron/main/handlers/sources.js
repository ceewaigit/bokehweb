const { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen } = require('electron')

function registerSourceHandlers() {
  // Legacy handler
  ipcMain.handle('get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 300, height: 200 }
      })
      return sources
    } catch (error) {
      console.error('Error getting sources:', error)
      return []
    }
  })

  // CRITICAL FIX: Return constraints that work with all Electron versions
  ipcMain.handle('get-desktop-stream', async (event, sourceId, hasAudio = false) => {
    try {
      console.log('🎥 Creating desktop stream for source:', sourceId, 'with audio:', hasAudio)
      
      // This format works universally across Electron versions
      const constraints = {
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

  ipcMain.handle('get-desktop-sources', async (event, options = {}) => {
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
              require('child_process').exec('open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            }
          }

          const permissionError = new Error('Screen recording permission denied')
          permissionError.code = 'PERMISSION_DENIED'
          throw permissionError
        }
      }

      // Sanitize options to prevent IPC errors
      const defaultOptions = {
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 },
        fetchWindowIcons: true
      }

      const sanitizedOptions = {
        types: Array.isArray(options.types) 
          ? options.types.filter(t => ['screen', 'window'].includes(t))
          : defaultOptions.types,
        thumbnailSize: (options.thumbnailSize && typeof options.thumbnailSize === 'object') 
          ? {
              width: Math.max(50, Math.min(300, parseInt(options.thumbnailSize.width) || 150)),
              height: Math.max(50, Math.min(300, parseInt(options.thumbnailSize.height) || 150))
            } 
          : defaultOptions.thumbnailSize,
        fetchWindowIcons: typeof options.fetchWindowIcons === 'boolean' 
          ? options.fetchWindowIcons 
          : defaultOptions.fetchWindowIcons
      }

      console.log('🎥 Requesting desktop sources with sanitized options:', JSON.stringify(sanitizedOptions))
      const sources = await desktopCapturer.getSources(sanitizedOptions)
      console.log(`📺 Found ${sources.length} desktop sources`)

      // Map sources and log them
      const mappedSources = sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon?.toDataURL()
      }))

      console.log('📺 Mapped sources:', mappedSources.map(s => `${s.name} (${s.id})`))
      return mappedSources
      
    } catch (error) {
      console.error('❌ Error getting desktop sources:', error)
      
      if (error?.message?.includes('Failed to get sources') || !error?.message) {
        const permissionError = new Error(
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

module.exports = { registerSourceHandlers }