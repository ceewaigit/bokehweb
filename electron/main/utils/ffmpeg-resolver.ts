/**
 * Simplified FFmpeg binary resolver using electron-builder's extraResources
 * Based on industry best practices - single lookup path with dev fallback
 */

import path from 'path';
import { app } from 'electron';
import fs from 'fs';

/**
 * Resolves the FFmpeg binary path for the current platform
 * In production: uses process.resourcesPath/bin/<platform>/ffmpeg
 * In development: uses Remotion's bundled FFmpeg from node_modules
 */
export function resolveFfmpegPath(): string {
  const platform = process.platform; // 'darwin' | 'win32' | 'linux'
  const exe = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  if (app.isPackaged) {
    // Production: Use FFmpeg from extraResources
    const ffmpegPath = path.join(process.resourcesPath, 'bin', platform, exe);
    
    if (fs.existsSync(ffmpegPath)) {
      console.log(`[FFmpeg Resolver] Production FFmpeg found at: ${ffmpegPath}`);
      return ffmpegPath;
    }
    
    throw new Error(`FFmpeg not found at expected production path: ${ffmpegPath}`);
  }
  
  // Development: Use Remotion's bundled FFmpeg
  const arch = process.arch;
  let compositorPackage = '';
  
  if (platform === 'darwin') {
    compositorPackage = arch === 'arm64' 
      ? '@remotion/compositor-darwin-arm64'
      : '@remotion/compositor-darwin-x64';
  } else if (platform === 'win32') {
    compositorPackage = '@remotion/compositor-win32-x64';
  } else if (platform === 'linux') {
    compositorPackage = arch === 'arm64'
      ? '@remotion/compositor-linux-arm64'
      : '@remotion/compositor-linux-x64';
  }
  
  const devPath = path.join(process.cwd(), 'node_modules', compositorPackage, exe);
  
  if (fs.existsSync(devPath)) {
    console.log(`[FFmpeg Resolver] Development FFmpeg found at: ${devPath}`);
    return devPath;
  }
  
  throw new Error(`FFmpeg not found in development at: ${devPath}`);
}

/**
 * Gets the compositor directory for Remotion's binariesDirectory option
 * Returns null in development to let Remotion auto-detect
 */
export function getCompositorDirectory(): string | null {
  if (!app.isPackaged) {
    // Development: Let Remotion auto-detect from node_modules
    return null;
  }
  
  // Production: Point to unpacked ASAR location
  const platform = process.platform;
  const arch = process.arch;
  
  let compositorName = '';
  if (platform === 'darwin') {
    compositorName = arch === 'arm64' 
      ? '@remotion/compositor-darwin-arm64'
      : '@remotion/compositor-darwin-x64';
  } else if (platform === 'win32') {
    compositorName = '@remotion/compositor-win32-x64';
  } else if (platform === 'linux') {
    compositorName = arch === 'arm64'
      ? '@remotion/compositor-linux-arm64'
      : '@remotion/compositor-linux-x64';
  }
  
  const compositorPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    compositorName
  );
  
  if (fs.existsSync(compositorPath)) {
    console.log(`[FFmpeg Resolver] Compositor directory: ${compositorPath}`);
    return compositorPath;
  }
  
  console.warn(`[FFmpeg Resolver] Compositor not found at: ${compositorPath}, using auto-detect`);
  return null;
}