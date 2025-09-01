import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent, nativeImage } from 'electron'
import { exec, execSync } from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { promisify } from 'util'

interface DesktopSourceOptions {
  types?: string[]
  thumbnailSize?: { width: number; height: number }
}

interface MediaConstraints {
  audio: boolean | { mandatory: { chromeMediaSource: string; chromeMediaSourceId?: string } }
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

      // For desktop audio capture, explicitly request 'desktop' as chromeMediaSource
      const audioConstraints = hasAudio
        ? {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId
            }
          }
        : false

      const constraints: MediaConstraints = {
        audio: audioConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      }

      console.log(`✅ Desktop stream constraints created - Audio: ${hasAudio}, Source: ${sourceId}`)
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

        if (status !== 'granted') {
          const parentWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()

          if (parentWindow) {
            const result = await dialog.showMessageBox(parentWindow, {
              type: 'warning',
              title: 'Screen Recording Permission Required',
              message: 'FlowCapture needs permission to record your screen.',
              detail: 'To enable screen recording:\n\n1. Open System Settings\n2. Go to Privacy & Security > Screen Recording\n3. Check the box next to FlowCapture\n4. Restart FlowCapture if needed\n\nClick "Open System Settings" to go there now.',
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

      const types = options.types || ['screen', 'window']
      const thumbnailSize = options.thumbnailSize || { width: 150, height: 150 }

      try {
        const sources = await desktopCapturer.getSources({
          types: types as any,
          thumbnailSize: thumbnailSize,
          fetchWindowIcons: false
        })


        // Import window bounds helper dynamically
        const { getWindowBoundsForSource } = await import('../native/window-bounds')

        // Map the sources to our format with bounds information
        const mappedSources = await Promise.all(sources.map(async source => {
          // Get window bounds for window sources
          let bounds = undefined
          if (!source.id.startsWith('screen:')) {
            bounds = await getWindowBoundsForSource(source.name)
            if (bounds) {
            }
          }

          return {
            id: source.id,
            name: source.name,
            display_id: source.display_id,
            thumbnail: source.thumbnail?.toDataURL() || undefined,
            bounds // Include window bounds if available
          }
        }))

        if (mappedSources.length === 0) {
          throw new Error('No sources found. Please check screen recording permissions.')
        }

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

  // Get window bounds for a specific source
  ipcMain.handle('get-source-bounds', async (_event: IpcMainInvokeEvent, sourceId: string) => {
    try {
      // For screens, return the display bounds
      if (sourceId.startsWith('screen:')) {
        const screenIdMatch = sourceId.match(/screen:(\d+):/)
        if (screenIdMatch) {
          const screenId = parseInt(screenIdMatch[1])
          const display = screen.getAllDisplays().find(d => d.id === screenId)
          if (display) {
            return {
              x: display.bounds.x,
              y: display.bounds.y,
              width: display.bounds.width,
              height: display.bounds.height
            }
          }
        }
      } else {
        // For windows, get the actual window bounds
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1, height: 1 }
        })

        const source = sources.find(s => s.id === sourceId)
        if (source) {
          const { getWindowBoundsForSource } = await import('../native/window-bounds')
          const bounds = await getWindowBoundsForSource(source.name)
          if (bounds) {
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height
            }
          }
        }
      }

      return null
    } catch (error) {
      console.error('Failed to get source bounds:', error)
      return null
    }
  })

  ipcMain.handle('get-platform', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.getSystemVersion?.() || 'unknown'
    }
  })

  ipcMain.handle('get-macos-wallpapers', async () => {
    const wallpapers = []
    const desktopPicturesPath = '/System/Library/Desktop Pictures'

    // Only use full-resolution HEIC files that actually exist
    // Skip .madesktop files as they only have low-res thumbnails available
    const availableWallpapers = [
      { name: 'Sonoma', file: 'Sonoma.heic' },
      { name: 'Sky Blue', file: 'Radial Sky Blue.heic' },
      { name: 'iMac Blue', file: 'iMac Blue.heic' },
      { name: 'iMac Green', file: 'iMac Green.heic' },
      { name: 'iMac Orange', file: 'iMac Orange.heic' },
      { name: 'iMac Pink', file: 'iMac Pink.heic' },
      { name: 'iMac Purple', file: 'iMac Purple.heic' },
      { name: 'iMac Silver', file: 'iMac Silver.heic' },
      { name: 'iMac Yellow', file: 'iMac Yellow.heic' }
    ]

    for (const wallpaper of availableWallpapers) {
      try {
        const fullPath = path.join(desktopPicturesPath, wallpaper.file)
        await fs.access(fullPath)

        // Generate small thumbnail (150px) for UI preview
        let thumbnail = null
        try {
          const tempFile = path.join(require('os').tmpdir(), `thumb-${Date.now()}.jpg`)
          execSync(`sips -Z 150 -s format jpeg "${fullPath}" --out "${tempFile}"`, { stdio: 'ignore' })
          const thumbBuffer = await fs.readFile(tempFile)
          thumbnail = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`
          await fs.unlink(tempFile).catch(() => { })
        } catch { }

        wallpapers.push({
          name: wallpaper.name,
          path: fullPath,
          thumbnail
        })
      } catch { }
    }

    return {
      wallpapers,
      gradients: []
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

      const ext = path.extname(imagePath).toLowerCase()

      // HEIC requires special handling on macOS
      if (process.platform === 'darwin' && ext === '.heic') {
        // Convert HEIC to JPEG using sips
        const tempFile = path.join(require('os').tmpdir(), `wallpaper-${Date.now()}.jpg`)
        execSync(`sips -s format jpeg "${imagePath}" --out "${tempFile}"`, { stdio: 'ignore' })

        // Read converted image
        const convertedBuffer = await fs.readFile(tempFile)
        const base64 = convertedBuffer.toString('base64')

        // Clean up temp file
        try { await fs.unlink(tempFile) } catch { }

        return `data:image/jpeg;base64,${base64}`
      }

      // For all other formats, use nativeImage
      const imageBuffer = await fs.readFile(imagePath)
      const image = nativeImage.createFromBuffer(imageBuffer)
      return image.toDataURL()
    } catch (error) {
      console.error('Error loading wallpaper image:', error)
      throw error
    }
  })

  // Image selection for custom backgrounds
  ipcMain.handle('select-image-file', async (event: IpcMainInvokeEvent) => {
    const { dialog } = require('electron')
    const mainWindow = BrowserWindow.fromWebContents(event.sender)

    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Background Image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('load-image-as-data-url', async (event: IpcMainInvokeEvent, imagePath: string) => {
    try {
      // Read the image file
      const imageBuffer = await fs.readFile(imagePath)
      const image = nativeImage.createFromBuffer(imageBuffer)

      // Convert to data URL
      return image.toDataURL()
    } catch (error) {
      console.error('Error loading image as data URL:', error)
      throw error
    }
  })

  // Area selection - disabled until ScreenCaptureKit implementation
  ipcMain.handle('select-screen-area', async () => {
    // TODO: Implement with ScreenCaptureKit (macOS 12.3+) for proper coordinates
    return {
      success: false,
      cancelled: true
    }
  })
}