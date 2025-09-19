/**
 * Local HTTP server for serving video files with Range support
 * Used by Remotion export since it can't access Electron's custom protocols
 */

import * as http from 'http'
import * as url from 'url'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

type MapEntry = {
  absPath: string
  expiresAt: number
}

// Token-based file access for security
const TOKENS = new Map<string, MapEntry>()

// MIME type detection
const guessMimeType = (absPath: string): string => {
  const ext = path.extname(absPath).toLowerCase()
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

export const startVideoServer = async (): Promise<{
  port: number
  registerFile: (absPath: string, ttlMs?: number) => string
  close: () => void
}> => {
  const server = http.createServer((req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400).end('Bad Request')
        return
      }

      const parsed = url.parse(req.url, true)
      // URL format: /v/<token>
      const parts = (parsed.pathname || '').split('/').filter(Boolean)
      
      if (parts.length !== 2 || parts[0] !== 'v') {
        res.writeHead(404).end('Not Found')
        return
      }

      const token = parts[1]
      const entry = TOKENS.get(token)
      
      if (!entry || Date.now() > entry.expiresAt) {
        console.log('[VideoServer] Token not found or expired:', token)
        res.writeHead(404).end('Not Found')
        return
      }

      const absPath = entry.absPath
      
      if (!fs.existsSync(absPath)) {
        console.error('[VideoServer] File not found:', absPath)
        res.writeHead(404).end('Not Found')
        return
      }

      const stat = fs.statSync(absPath)
      const total = stat.size
      const mimeType = guessMimeType(absPath)

      const headersBase = {
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Last-Modified': stat.mtime.toUTCString(),
        'ETag': `W/"${total}-${Math.floor(stat.mtimeMs)}"`
      }

      // Handle OPTIONS (CORS preflight)
      if (req.method === 'OPTIONS') {
        res.writeHead(200, headersBase).end()
        return
      }

      // Handle HEAD
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          ...headersBase,
          'Content-Length': String(total)
        }).end()
        return
      }

      const range = req.headers.range

      if (range) {
        // Parse Range header
        const match = /bytes=(\d*)-(\d*)/.exec(range)
        let start = match?.[1] ? parseInt(match[1], 10) : 0
        let end = match?.[2] ? parseInt(match[2], 10) : total - 1

        // Validate range
        if (Number.isNaN(start) || start < 0) start = 0
        if (Number.isNaN(end) || end >= total) end = total - 1

        if (start >= total || end < start) {
          res.writeHead(416, {
            'Content-Range': `bytes */${total}`,
            'Accept-Ranges': 'bytes'
          }).end()
          return
        }

        const chunkSize = end - start + 1

        console.log(`[VideoServer] Range request: bytes ${start}-${end}/${total} for ${path.basename(absPath)}`)

        res.writeHead(206, {
          ...headersBase,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': String(chunkSize)
        })

        fs.createReadStream(absPath, {
          start,
          end,
          highWaterMark: 256 * 1024 // 256KB chunks
        }).pipe(res)
      } else {
        // No range - send entire file
        console.log(`[VideoServer] Full file request for ${path.basename(absPath)}`)
        
        res.writeHead(200, {
          ...headersBase,
          'Content-Length': String(total)
        })

        fs.createReadStream(absPath, {
          highWaterMark: 256 * 1024
        }).pipe(res)
      }
    } catch (error) {
      console.error('[VideoServer] Request error:', error)
      res.writeHead(500).end('Internal Server Error')
    }
  })

  // Start server on random port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start video server')
  }

  const port = address.port
  console.log(`[VideoServer] Started on http://127.0.0.1:${port}`)

  // Register a file and get a URL with token
  const registerFile = (absPath: string, ttlMs = 60000): string => {
    const token = crypto.randomUUID()
    TOKENS.set(token, {
      absPath,
      expiresAt: Date.now() + ttlMs
    })
    
    const url = `http://127.0.0.1:${port}/v/${token}`
    console.log(`[VideoServer] Registered file: ${path.basename(absPath)} -> ${url}`)
    return url
  }

  // Close server
  const close = () => {
    console.log('[VideoServer] Shutting down...')
    server.close()
    TOKENS.clear()
  }

  // Periodically clean up expired tokens
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    let cleaned = 0
    for (const [token, entry] of TOKENS) {
      if (entry.expiresAt < now) {
        TOKENS.delete(token)
        cleaned++
      }
    }
    if (cleaned > 0) {
      console.log(`[VideoServer] Cleaned up ${cleaned} expired tokens`)
    }
  }, 30000) // Every 30 seconds

  // Prevent interval from keeping process alive
  cleanupInterval.unref()

  // Clean up on server close
  server.on('close', () => {
    clearInterval(cleanupInterval)
  })

  return { port, registerFile, close }
}

// Global singleton instance
let videoServerInstance: Awaited<ReturnType<typeof startVideoServer>> | null = null

export const getVideoServer = async () => {
  if (!videoServerInstance) {
    videoServerInstance = await startVideoServer()
  }
  return videoServerInstance
}

export const stopVideoServer = () => {
  if (videoServerInstance) {
    videoServerInstance.close()
    videoServerInstance = null
  }
}