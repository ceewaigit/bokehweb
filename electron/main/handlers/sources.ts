import { ipcMain, desktopCapturer, BrowserWindow, dialog, systemPreferences, screen, IpcMainInvokeEvent, nativeImage } from 'electron'
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
        
        // Import window bounds helper dynamically
        const { getWindowBoundsForSource } = await import('../native/window-bounds')
        
        // Map the sources to our format with bounds information
        const mappedSources = await Promise.all(sources.map(async source => {
          // Get window bounds for window sources
          let bounds = undefined
          if (!source.id.startsWith('screen:')) {
            bounds = await getWindowBoundsForSource(source.name)
            if (bounds) {
              console.log(`📐 Window "${source.name}" bounds: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`)
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
    try {
      const wallpaperDirs = [
        '/System/Library/Desktop Pictures',
        '/Library/Desktop Pictures'
      ]
      
      // Priority list of macOS version wallpapers (commonly used in Screen Studio)
      const priorityWallpapers = [
        'Sonoma', 'Ventura', 'Monterey', 'Big Sur', 'Catalina', 
        'Mojave', 'High Sierra', 'Sierra', 'El Capitan', 'Yosemite'
      ]
      
      const wallpapers: Array<{ name: string, path: string, thumbnail?: string }> = []
      const foundWallpapers = new Set<string>()
      
      // First, look for macOS version wallpapers
      for (const dir of wallpaperDirs) {
        try {
          const files = await fs.readdir(dir)
          
          // Process priority wallpapers first
          for (const priority of priorityWallpapers) {
            for (const file of files) {
              // Match files that contain the macOS version name
              if (file.toLowerCase().includes(priority.toLowerCase()) && 
                  file.match(/\.(heic|jpg|jpeg|png|tiff)$/i) &&
                  !foundWallpapers.has(file)) {
                
                const fullPath = path.join(dir, file)
                const name = path.basename(file, path.extname(file))
                
                // Generate thumbnail
                let thumbnail: string | undefined
                
                if (process.platform === 'darwin' && file.match(/\.heic$/i)) {
                  try {
                    const tempFile = path.join(require('os').tmpdir(), `thumb-${Date.now()}.jpg`)
                    execSync(`sips -s format jpeg -Z 200 "${fullPath}" --out "${tempFile}"`, { stdio: 'ignore' })
                    
                    const convertedBuffer = await fs.readFile(tempFile)
                    const convertedImage = nativeImage.createFromBuffer(convertedBuffer)
                    thumbnail = convertedImage.toDataURL()
                    
                    try { await fs.unlink(tempFile) } catch {}
                  } catch (err) {
                    console.log(`Could not convert HEIC thumbnail: ${file}`)
                  }
                } else {
                  try {
                    const imageBuffer = await fs.readFile(fullPath)
                    const image = nativeImage.createFromBuffer(imageBuffer)
                    const resized = image.resize({ 
                      width: 200,
                      height: 120,
                      quality: 'good'
                    })
                    thumbnail = resized.toDataURL()
                  } catch (err) {
                    console.log(`Could not generate thumbnail: ${file}`)
                  }
                }
                
                wallpapers.push({
                  name: name.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, ''), // Remove number prefixes
                  path: fullPath,
                  thumbnail
                })
                
                foundWallpapers.add(file)
              }
            }
          }
          
          // If we need more wallpapers, add some abstract/graphic ones
          if (wallpapers.length < 12) {
            const additionalPatterns = ['Abstract', 'Graphic', 'Color', 'Wave']
            for (const pattern of additionalPatterns) {
              for (const file of files) {
                if (wallpapers.length >= 12) break
                
                if (file.toLowerCase().includes(pattern.toLowerCase()) && 
                    file.match(/\.(heic|jpg|jpeg|png|tiff)$/i) &&
                    !foundWallpapers.has(file)) {
                  
                  const fullPath = path.join(dir, file)
                  const name = path.basename(file, path.extname(file))
                  
                  // Generate thumbnail (same logic as above)
                  let thumbnail: string | undefined
                  
                  if (process.platform === 'darwin' && file.match(/\.heic$/i)) {
                    try {
                      const tempFile = path.join(require('os').tmpdir(), `thumb-${Date.now()}.jpg`)
                      execSync(`sips -s format jpeg -Z 200 "${fullPath}" --out "${tempFile}"`, { stdio: 'ignore' })
                      
                      const convertedBuffer = await fs.readFile(tempFile)
                      const convertedImage = nativeImage.createFromBuffer(convertedBuffer)
                      thumbnail = convertedImage.toDataURL()
                      
                      try { await fs.unlink(tempFile) } catch {}
                    } catch (err) {
                      console.log(`Could not convert HEIC thumbnail: ${file}`)
                    }
                  } else {
                    try {
                      const imageBuffer = await fs.readFile(fullPath)
                      const image = nativeImage.createFromBuffer(imageBuffer)
                      const resized = image.resize({ 
                        width: 200,
                        height: 120,
                        quality: 'good'
                      })
                      thumbnail = resized.toDataURL()
                    } catch (err) {
                      console.log(`Could not generate thumbnail: ${file}`)
                    }
                  }
                  
                  wallpapers.push({
                    name: name.replace(/_/g, ' ').replace(/^\d+\s*-\s*/, ''),
                    path: fullPath,
                    thumbnail
                  })
                  
                  foundWallpapers.add(file)
                }
              }
            }
          }
        } catch {
          // Directory not accessible, skip
        }
      }
      
      // Sort to prioritize macOS version wallpapers
      wallpapers.sort((a, b) => {
        const aIndex = priorityWallpapers.findIndex(p => a.name.includes(p))
        const bIndex = priorityWallpapers.findIndex(p => b.name.includes(p))
        
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        return 0
      })
      
      const macOSGradients = [
        { name: 'Sonoma Gradient', path: 'gradient:sonoma', colors: ['#2D3748', '#1A202C'] },
        { name: 'Ventura Gradient', path: 'gradient:ventura', colors: ['#1E3A8A', '#312E81'] },
        { name: 'Monterey Gradient', path: 'gradient:monterey', colors: ['#065F46', '#064E3B'] },
        { name: 'Big Sur Gradient', path: 'gradient:bigsur', colors: ['#DC2626', '#991B1B'] }
      ]
      
      return {
        wallpapers: wallpapers.slice(0, 12), // Return top 12
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
        try { await fs.unlink(tempFile) } catch {}
        
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

  // Area selection - disabled until ScreenCaptureKit implementation
  ipcMain.handle('select-screen-area', async () => {
    // TODO: Implement with ScreenCaptureKit (macOS 12.3+) for proper coordinates
    return {
      success: false,
      cancelled: true
    }
  })
}