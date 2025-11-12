/**
 * FFmpeg binary resolver using @ffmpeg-installer/ffmpeg
 * Uses bundled static FFmpeg binary that works reliably across all environments
 */

import path from 'path';
import { app } from 'electron';
import fs from 'fs';

/**
 * Resolves the FFmpeg binary path for the current platform
 * Priority order:
 * 1. @ffmpeg-installer/ffmpeg (bundled static binary - works everywhere)
 * 2. Remotion's bundled FFmpeg (fallback for dev if installer fails)
 */
export function resolveFfmpegPath(): string {
  // OPTION 1: Use @ffmpeg-installer/ffmpeg (reliable, static binary)
  try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    if (fs.existsSync(ffmpegPath)) {
      console.log(`[FFmpeg Resolver] Using @ffmpeg-installer binary: ${ffmpegPath}`);
      return ffmpegPath;
    }
  } catch (error) {
    console.warn('[FFmpeg Resolver] @ffmpeg-installer not available, trying fallbacks...');
  }

  // OPTION 2: Fallback to Remotion's FFmpeg (dev only, has library issues)
  const platform = process.platform;
  const arch = process.arch;
  const exe = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

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

  const remotionPath = path.join(
    app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules') : path.join(process.cwd(), 'node_modules'),
    compositorPackage,
    exe
  );

  if (fs.existsSync(remotionPath)) {
    console.log(`[FFmpeg Resolver] Fallback: Using Remotion FFmpeg at: ${remotionPath}`);
    console.warn(`[FFmpeg Resolver] Warning: Remotion's FFmpeg may have library issues. Install @ffmpeg-installer/ffmpeg for best results.`);
    return remotionPath;
  }

  throw new Error(`FFmpeg not found. Tried: @ffmpeg-installer/ffmpeg and ${remotionPath}`);
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