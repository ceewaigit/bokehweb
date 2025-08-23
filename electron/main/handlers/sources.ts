import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent } from 'electron'
import { exec, execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

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

      // Use desktopCapturer properly with error handling
      console.log('🎥 Getting desktop sources via desktopCapturer')
      
      const types = options.types || ['screen', 'window']
      const thumbnailSize = options.thumbnailSize || { width: 150, height: 150 }
      
      try {
        const sources = await desktopCapturer.getSources({
          types: types as any,
          thumbnailSize: thumbnailSize,
          fetchWindowIcons: false
        })
        
        console.log(`📺 Found ${sources.length} sources`)
        
        // Map the sources to our format
        const mappedSources = sources.map(source => ({
          id: source.id,
          name: source.name,
          display_id: source.display_id,
          thumbnail: source.thumbnail?.toDataURL() || undefined
        }))
        
        if (mappedSources.length === 0) {
          throw new Error('No sources found. Please check screen recording permissions.')
        }
        
        console.log('📺 Returning sources:', mappedSources.map(s => `${s.name} (${s.id})`))
        return mappedSources
      } catch (captureError) {
        console.error('desktopCapturer failed:', captureError)
        throw new Error('Failed to capture desktop sources. Please check screen recording permissions.')
      }

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

  ipcMain.handle('get-macos-wallpapers', async () => {
    try {
      const wallpaperDirs = [
        '/System/Library/Desktop Pictures',
        '/Library/Desktop Pictures',
        path.join(process.env.HOME || '', 'Pictures')
      ]
      
      const wallpapers: Array<{ name: string, path: string }> = []
      
      for (const dir of wallpaperDirs) {
        try {
          const files = await fs.readdir(dir)
          for (const file of files) {
            if (file.match(/\.(heic|jpg|jpeg|png|tiff|gif)$/i)) {
              const fullPath = path.join(dir, file)
              const name = path.basename(file, path.extname(file))
              
              wallpapers.push({
                name: name.replace(/_/g, ' '),
                path: fullPath
              })
            }
          }
        } catch {
          // Directory not accessible, skip
        }
      }
      
      const macOSGradients = [
        { name: 'macOS Monterey', path: 'gradient:monterey', colors: ['#1C4E80', '#7C909C'] },
        { name: 'macOS Ventura', path: 'gradient:ventura', colors: ['#243B53', '#829AB1'] },
        { name: 'macOS Sonoma', path: 'gradient:sonoma', colors: ['#2D3436', '#636E72'] },
        { name: 'macOS Big Sur', path: 'gradient:bigsur', colors: ['#FF6B6B', '#4ECDC4'] }
      ]
      
      return {
        wallpapers: wallpapers.slice(0, 20),
        gradients: macOSGradients
      }
    } catch (error) {
      console.error('Error getting macOS wallpapers:', error)
      return { wallpapers: [], gradients: [] }
    }
  })

  ipcMain.handle('load-wallpaper-image', async (event: IpcMainInvokeEvent, imagePath: string) => {
    try {
      const allowedDirs = [
        '/System/Library/Desktop Pictures',
        '/Library/Desktop Pictures',
        path.join(process.env.HOME || '', 'Pictures')
      ]
      
      const isAllowed = allowedDirs.some(dir => imagePath.startsWith(dir))
      if (!isAllowed) {
        throw new Error('Access denied')
      }
      
      const imageBuffer = await fs.readFile(imagePath)
      const base64 = imageBuffer.toString('base64')
      
      const ext = path.extname(imagePath).toLowerCase()
      let mimeType = 'image/jpeg'
      if (ext === '.png') mimeType = 'image/png'
      else if (ext === '.gif') mimeType = 'image/gif'
      else if (ext === '.heic') mimeType = 'image/heic'
      else if (ext === '.tiff' || ext === '.tif') mimeType = 'image/tiff'
      
      return `data:${mimeType};base64,${base64}`
    } catch (error) {
      console.error('Error loading wallpaper image:', error)
      throw error
    }
  })

  // Native macOS area selection using screencapture
  ipcMain.handle('select-screen-area', async () => {
    if (process.platform !== 'darwin') {
      throw new Error('Area selection is only supported on macOS')
    }

    try {
      console.log('🎯 Starting native macOS area selection')
      
      // Create a temporary file for the screenshot (we'll delete it after getting coords)
      const tempFile = path.join(require('os').tmpdir(), `temp-selection-${Date.now()}.png`)
      
      // Use screencapture with interactive selection mode
      // -i: interactive mode
      // -s: selection mode only (no window mode)
      // -o: no shadow
      // -x: no sound
      const command = `screencapture -i -s -o -x "${tempFile}"`
      
      try {
        // Execute screencapture and wait for user to make selection
        execSync(command, { stdio: 'ignore' })
        
        // If we get here, user made a selection (otherwise execSync would throw)
        // Get the image dimensions to determine the selected area
        const sipsCommand = `sips -g pixelWidth -g pixelHeight "${tempFile}"`
        const sipsOutput = execSync(sipsCommand, { encoding: 'utf8' })
        
        // Parse dimensions from sips output
        const widthMatch = sipsOutput.match(/pixelWidth:\s*(\d+)/)
        const heightMatch = sipsOutput.match(/pixelHeight:\s*(\d+)/)
        
        if (!widthMatch || !heightMatch) {
          throw new Error('Could not determine selection dimensions')
        }
        
        const width = parseInt(widthMatch[1])
        const height = parseInt(heightMatch[1])
        
        // Clean up temp file
        try {
          await fs.unlink(tempFile)
        } catch {}
        
        // LIMITATION: screencapture -i doesn't return the position of the selection
        // Only the dimensions. We need the position for proper video cropping.
        // For a proper implementation, we'd need to use native macOS APIs or
        // a third-party tool that returns both dimensions AND position.
        
        // TEMPORARY: Use (0,0) which means the selection starts at top-left
        // This means area selection will only work properly if users select
        // from the top-left corner of the screen
        const x = 0
        const y = 0
        const display = screen.getPrimaryDisplay()
        
        console.log(`✅ Area selected: ${width}x${height} at approximately (${x}, ${y})`)
        
        return {
          success: true,
          area: {
            x: x,
            y: y,
            width: width,
            height: height,
            displayId: display.id
          }
        }
        
      } catch (error: any) {
        // User cancelled selection (ESC key)
        if (error.status === 1) {
          console.log('🚫 User cancelled area selection')
          return {
            success: false,
            cancelled: true
          }
        }
        throw error
      }
      
    } catch (error) {
      console.error('❌ Error in native area selection:', error)
      throw error
    }
  })
}