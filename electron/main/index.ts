import { app, BrowserWindow, protocol, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { Readable } from 'stream'
import { isDev, getRecordingsDirectory } from './config'
import { findVideoFile, normalizeCrossPlatform } from './utils/path-normalizer'
import { makeVideoSrc } from './utils/video-url-factory'
import { createRecordButton, setupRecordButton } from './windows/record-button'
import { checkMediaPermissions } from './services/permissions'
import { registerRecordingHandlers } from './handlers/recording'
import { registerSourceHandlers } from './handlers/sources'
import { registerPermissionHandlers } from './handlers/permissions'
import { registerMouseTrackingHandlers, cleanupMouseTracking } from './handlers/mouse-tracking'
import { registerKeyboardTrackingHandlers, cleanupKeyboardTracking } from './handlers/keyboard-tracking'
import { registerFileOperationHandlers } from './handlers/file-operations'
import { registerDialogHandlers } from './handlers/dialogs'
import { registerWindowControlHandlers } from './handlers/window-controls'
import { setupNativeRecorder } from './handlers/native-recorder'
import { setupExportHandler } from './handlers/export-handler'

// Helper functions for MIME type detection
const guessMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.mov': return 'video/quicktime'
    case '.mkv': return 'video/x-matroska'
    case '.m4v': return 'video/x-m4v'
    case '.avi': return 'video/x-msvideo'
    case '.ogv': return 'video/ogg'
    default: return 'application/octet-stream'
  }
}

// Register custom protocols before app ready
// This ensures they're available when needed
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'video-stream',
    privileges: {
      standard: true,        // Behaves like http/https
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  },
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

function registerProtocol(): void {
  // Register app protocol for packaged app
  if (!isDev && app.isPackaged) {
    protocol.handle('app', async (request) => {
      const url = request.url.replace('app://', '')
      const decodedUrl = decodeURIComponent(url)
      try {
        const filePath = path.join(app.getAppPath(), 'out', decodedUrl)
        const stat = fs.statSync(filePath)
        const stream = fs.createReadStream(filePath)
        const body = Readable.toWeb(stream as any)
        
        return new Response(body as any, {
          status: 200,
          headers: {
            'Content-Length': String(stat.size),
            'Content-Type': 'text/html' // Adjust based on file type if needed
          }
        })
      } catch (error) {
        console.error('[Protocol] Error loading file:', error)
        return new Response('Not found', { status: 404 })
      }
    })
  }

  // Register video-stream protocol with HTTP Range support
  protocol.handle('video-stream', async (request) => {
    try {
      // Parse URL - handle ALL possible formats
      const url = new URL(request.url)
      let filePath: string = ''
      
      // Handle static assets (cursors, images, etc.)
      if (url.host === 'assets') {
        const assetPath = url.pathname.slice(1) // Remove leading slash
        const publicPath = isDev 
          ? path.join(__dirname, '../../../public', assetPath)
          : path.join(process.resourcesPath, 'public', assetPath)
        
        if (!fs.existsSync(publicPath)) {
          console.error('[Protocol] Asset not found:', publicPath)
          return new Response('Asset not found', { status: 404 })
        }
        
        // Serve the asset file
        const buffer = fs.readFileSync(publicPath)
        const mimeType = assetPath.endsWith('.png') ? 'image/png' : 
                         assetPath.endsWith('.jpg') ? 'image/jpeg' :
                         assetPath.endsWith('.svg') ? 'image/svg+xml' :
                         'application/octet-stream'
        
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=3600'
          }
        })
      }
      
      // Format 1: video-stream://local/<encoded-path>
      if (url.host === 'local' || url.host === 'localhost') {
        const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
        try {
          filePath = decodeURIComponent(encodedPath)
        } catch {
          filePath = encodedPath // Use as-is if decode fails
        }
      } 
      // Format 2: video-stream://Users/... or video-stream://users/... (malformed)
      else if (url.host) {
        // Try to reconstruct the path
        const hostPart = url.host
        const pathPart = url.pathname
        
        // Handle Windows paths (e.g., host="c", pathname="/Users/...")
        if (hostPart.length === 1 && /[a-zA-Z]/.test(hostPart)) {
          filePath = `${hostPart.toUpperCase()}:${pathPart}`
        }
        // Handle Unix paths (e.g., host="users", pathname="/name/...")
        else {
          // Capitalize first letter for common directories
          const capitalizedHost = ['users', 'home', 'var', 'tmp', 'opt'].includes(hostPart.toLowerCase()) 
            ? hostPart.charAt(0).toUpperCase() + hostPart.slice(1).toLowerCase()
            : hostPart
          filePath = `/${capitalizedHost}${pathPart}`
        }
        
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // Use as-is if decode fails
        }
      }
      // Format 3: video-stream:///path/to/file (triple slash)
      else if (url.pathname) {
        try {
          filePath = decodeURIComponent(url.pathname)
        } catch {
          filePath = url.pathname
        }
      }
      
      // Format 4: Extract from full URL string if above failed
      if (!filePath || filePath === '/') {
        // Try to extract path from the original URL
        const match = request.url.match(/video-stream:\/\/(.+)$/)
        if (match) {
          filePath = match[1]
          // Remove 'local/' prefix if present
          if (filePath.startsWith('local/')) {
            filePath = filePath.slice(6)
          }
          try {
            filePath = decodeURIComponent(filePath)
          } catch {
            // Use as-is
          }
        }
      }
      
      // Use cross-platform normalizer
      filePath = normalizeCrossPlatform(filePath)
      
      // Try to find the file using multiple strategies
      const foundPath = findVideoFile(filePath)
      if (foundPath) {
        filePath = foundPath
      } else {
        // Last resort: try with recordings directory
        const recordingsDir = getRecordingsDirectory()
        const inRecordings = path.join(recordingsDir, path.basename(filePath))
        if (fs.existsSync(inRecordings)) {
          filePath = inRecordings
        } else {
          console.error('[Protocol] File not found after all attempts:', filePath)
          console.log('[Protocol] Searched in recordings dir:', recordingsDir)
          return new Response('Not found', { status: 404 })
        }
      }

      const stat = fs.statSync(filePath)
      const total = stat.size
      const mimeType = guessMimeType(filePath)
      const lastModified = stat.mtime.toUTCString()
      const etag = `W/"${total}-${Math.floor(stat.mtimeMs)}"`

      // Handle HEAD requests
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(total),
            'Content-Type': mimeType,
            'Last-Modified': lastModified,
            'ETag': etag,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const rangeHeader = request.headers.get('range')

      if (rangeHeader) {
        // Parse Range header: bytes=<start>-<end>
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
        let start = match?.[1] ? parseInt(match[1], 10) : 0
        let end = match?.[2] ? parseInt(match[2], 10) : total - 1
        
        // Validate range
        if (Number.isNaN(start) || start < 0) start = 0
        if (Number.isNaN(end) || end >= total) end = total - 1
        
        if (start >= total || end < start) {
          return new Response(null, {
            status: 416, // Range Not Satisfiable
            headers: {
              'Content-Range': `bytes */${total}`,
              'Accept-Ranges': 'bytes'
            }
          })
        }

        const chunkSize = end - start + 1
        const nodeStream = fs.createReadStream(filePath, {
          start,
          end,
          highWaterMark: 256 * 1024 // 256KB chunks
        })

        // Convert Node stream to Web ReadableStream
        const body = Readable.toWeb(nodeStream as any)

        return new Response(body as any, {
          status: 206, // Partial Content
          headers: {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': mimeType,
            'Last-Modified': lastModified,
            'ETag': etag,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      // No Range header - stream entire file
      const nodeStream = fs.createReadStream(filePath, {
        highWaterMark: 256 * 1024
      })
      const body = Readable.toWeb(nodeStream as any)

      return new Response(body as any, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
          'Content-Type': mimeType,
          'Last-Modified': lastModified,
          'ETag': etag,
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      console.error('[Protocol] video-stream handler error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
}

function registerAllHandlers(): void {
  registerRecordingHandlers()
  registerSourceHandlers()
  registerPermissionHandlers()
  registerMouseTrackingHandlers()
  registerKeyboardTrackingHandlers()
  registerFileOperationHandlers()
  registerDialogHandlers()
  registerWindowControlHandlers()
  setupNativeRecorder()
  setupExportHandler()
  
  // Path resolution handler - replaces path-resolver.ts functionality
  ipcMain.handle('resolve-recording-path', async (_, filePath: string, folderPath?: string) => {
    try {
      // Handle absolute paths
      if (path.isAbsolute(filePath)) {
        const videoUrl = await makeVideoSrc(filePath, 'preview')
        return videoUrl
      }
      
      // Handle relative paths with folder context
      if (folderPath) {
        const recordingsDir = getRecordingsDirectory()
        const normalizedFolder = normalizeCrossPlatform(folderPath)
        const resolvedFolder = path.isAbsolute(normalizedFolder)
          ? normalizedFolder
          : path.join(recordingsDir, normalizedFolder)

        const parentDir = path.dirname(resolvedFolder)
        const candidates = new Set<string>()

        if (filePath) {
          const normalizedFile = normalizeCrossPlatform(filePath)
          const fileName = path.basename(normalizedFile)

          // New structure: media lives inside the recording folder
          candidates.add(path.join(resolvedFolder, fileName))

          // Handle relative paths that already include the recording folder name
          if (!path.isAbsolute(normalizedFile) && parentDir && parentDir !== resolvedFolder) {
            candidates.add(path.join(parentDir, normalizedFile))
          }

          // Legacy structure: media sits alongside the recording folder
          if (parentDir && parentDir !== resolvedFolder) {
            candidates.add(path.join(parentDir, fileName))
          }
        }

        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            const videoUrl = await makeVideoSrc(candidate, 'preview')
            return videoUrl
          }
        }
      }

      // Try to find the video file
      const foundPath = findVideoFile(filePath)
      if (foundPath) {
        const videoUrl = await makeVideoSrc(foundPath, 'preview')
        return videoUrl
      }
      
      // Fallback: use recordings directory
      const recordingsDir = getRecordingsDirectory()
      const defaultPath = path.join(recordingsDir, filePath)
      const videoUrl = await makeVideoSrc(defaultPath, 'preview')
      return videoUrl
    } catch (error) {
      console.error('[IPC] Error resolving recording path:', error)
      throw error
    }
  })
}

// Define global variables with proper types
declare global {
  var recordingsDirectory: string
  var mainWindow: BrowserWindow | null
  var recordButton: BrowserWindow | null
}

global.recordingsDirectory = getRecordingsDirectory()

async function initializeApp(): Promise<void> {
  console.log(`🚀 App ready - Electron version: ${process.versions.electron}`)
  console.log(`🌐 Chrome version: ${process.versions.chrome}`)
  
  registerProtocol()
  await checkMediaPermissions()
  registerAllHandlers()
  
  // Add request logging for debugging video URLs
  const { session } = await import('electron')
  const ses = session.defaultSession
  
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith('file:') || details.url.startsWith('video-stream:')) {
      console.log('[MEDIA-REQUEST]', {
        url: details.url,
        resourceType: details.resourceType,
        method: details.method
      })
    }
    callback({})
  })

  global.mainWindow = null

  const recordButton = createRecordButton()
  global.recordButton = recordButton
  setupRecordButton(recordButton)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newRecordButton = createRecordButton()
      global.recordButton = newRecordButton
      setupRecordButton(newRecordButton)
    }
  })
}

app.whenReady().then(initializeApp)

if (isDev) {
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')
}

// Aggressive GPU acceleration flags
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blacklist')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('use-angle', 'metal')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192')

app.on('window-all-closed', () => {
  cleanupMouseTracking()
  cleanupKeyboardTracking()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (error: Error) => {
  console.error('[Process] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[Process] Unhandled Rejection:', { promise, reason })
})
