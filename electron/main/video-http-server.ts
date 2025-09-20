/**
 * Local HTTP server for serving video files with Range support
 * Uses Express and serve-static for robust, secure file serving
 */

import express from 'express';
import serveStatic from 'serve-static';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';

// Token storage with expiry
interface TokenEntry {
  absPath: string;
  expiresAt: number;
}

const TOKENS = new Map<string, TokenEntry>();

// Singleton server instance
let serverInstance: {
  app: express.Application;
  server: any;
  port: number;
} | null = null;

/**
 * Middleware to check Host header against DNS rebinding attacks
 */
const hostGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const host = req.headers.host;
  if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
    return next();
  }
  res.status(403).send('Forbidden');
};

/**
 * Middleware to check bearer token authentication
 */
const tokenAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = req.params.token;
  
  const entry = TOKENS.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(401).send('Unauthorized');
  }
  
  // Attach the file path to the request for the serve handler
  (req as any).videoPath = entry.absPath;
  next();
};

/**
 * Start the video HTTP server with security and Range support
 */
export async function startVideoServer(): Promise<{
  port: number;
  registerFile: (absPath: string, ttlMs?: number) => string;
  close: () => void;
}> {
  // Return existing server if already running
  if (serverInstance) {
    return {
      port: serverInstance.port,
      registerFile: createRegisterFunction(serverInstance.port),
      close: () => closeServer()
    };
  }

  const app = express();
  
  // Security middleware - apply to all routes
  app.use(hostGuard);
  
  // CORS headers for Remotion
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Range, Authorization');
    next();
  });
  
  // Handle OPTIONS preflight
  app.options('*', (req, res) => {
    res.sendStatus(200);
  });
  
  // Video serving route with token auth
  app.get('/v/:token', tokenAuth, (req, res, next) => {
    const videoPath = (req as any).videoPath;
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Not Found');
    }
    
    // Use serve-static with proper options for video streaming
    const handler = serveStatic(path.dirname(videoPath), {
      acceptRanges: true,
      cacheControl: false,
      etag: true,
      lastModified: true,
      index: false,
      fallthrough: false,
      setHeaders: (res, filepath) => {
        const ext = path.extname(filepath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.mkv': 'video/x-matroska',
          '.m4v': 'video/x-m4v',
          '.avi': 'video/x-msvideo',
          '.ogv': 'video/ogg'
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      }
    });
    
    // Rewrite request URL to just the filename
    req.url = '/' + path.basename(videoPath);
    handler(req, res, next);
  });
  
  // Start server on random port, bound to loopback only
  const server = await new Promise<any>((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      resolve(srv);
    });
    srv.on('error', reject);
  });
  
  const address = server.address() as AddressInfo;
  const port = address.port;
  
  console.log(`[VideoServer] Started on http://127.0.0.1:${port}`);
  
  // Store server instance
  serverInstance = { app, server, port };
  
  // Cleanup expired tokens every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, entry] of TOKENS) {
      if (entry.expiresAt < now) {
        TOKENS.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[VideoServer] Cleaned up ${cleaned} expired tokens`);
    }
  }, 60000);
  
  // Clear interval on server close
  server.on('close', () => {
    clearInterval(cleanupInterval);
  });
  
  return {
    port,
    registerFile: createRegisterFunction(port),
    close: () => closeServer()
  };
}

/**
 * Create a register function for the given port
 */
function createRegisterFunction(port: number) {
  return (absPath: string, ttlMs = 60000): string => {
    const token = crypto.randomUUID();
    TOKENS.set(token, {
      absPath,
      expiresAt: Date.now() + ttlMs
    });
    
    const url = `http://127.0.0.1:${port}/v/${token}`;
    console.log(`[VideoServer] Registered: ${path.basename(absPath)} -> ${url}`);
    return url;
  };
}

/**
 * Close the server and clean up
 */
function closeServer() {
  if (serverInstance) {
    console.log('[VideoServer] Shutting down...');
    serverInstance.server.close();
    TOKENS.clear();
    serverInstance = null;
  }
}

// Singleton getter for the video server
let serverPromise: ReturnType<typeof startVideoServer> | null = null;

export async function getVideoServer() {
  if (!serverPromise) {
    serverPromise = startVideoServer();
  }
  return serverPromise;
}