/**
 * Electron main process handler for Remotion export
 * Handles the actual export using Node.js APIs
 */

import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';

export function setupExportHandler() {
  console.log('📦 Setting up export handler');
  
  ipcMain.handle('export-video', async (event, { segments, recordings, metadata, settings }) => {
    console.log('📹 Export handler invoked with settings:', settings);
    try {
      // Lazy load Remotion modules to avoid import issues
      const { renderMedia, selectComposition } = await import('@remotion/renderer');
      const { bundle } = await import('@remotion/bundler');
      
      // Bundle Remotion project
      const entryPoint = path.join(process.cwd(), 'src/remotion/index.ts');
      const bundleLocation = await bundle({
        entryPoint,
        webpackOverride: (config) => {
          const resolvedPath = path.resolve(process.cwd(), 'src');
          return {
            ...config,
            resolve: {
              ...config.resolve,
              alias: {
                ...config.resolve?.alias,
                '@': resolvedPath,
                '@/types': path.join(resolvedPath, 'types'),
                '@/lib': path.join(resolvedPath, 'lib'),
                '@/remotion': path.join(resolvedPath, 'remotion'),
              },
              extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
            },
          };
        },
      });

      // Prepare composition props
      const inputProps = {
        segments,
        recordings: Object.fromEntries(recordings),
        metadata: Object.fromEntries(metadata),
        ...settings,
      };

      // Select composition
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: 'MainComposition',
        inputProps,
      });

      // Create temp output path
      const outputPath = path.join(
        process.cwd(),
        'temp',
        `export-${Date.now()}.${settings.format || 'mp4'}`
      );
      
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Render video
      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: settings.format === 'webm' ? 'vp8' : 'h264',
        outputLocation: outputPath,
        inputProps,
        onProgress: (info) => {
          // Send progress to renderer
          event.sender.send('export-progress', {
            progress: Math.min(95, 10 + (info.progress * 85)),
            currentFrame: info.renderedFrames,
            totalFrames: composition.durationInFrames,
          });
        },
        concurrency: 4,
        jpegQuality: settings.quality === 'high' ? 95 : 85,
      });

      // Read file and convert to base64
      const buffer = await fs.readFile(outputPath);
      const base64 = buffer.toString('base64');

      // Clean up
      await fs.unlink(outputPath).catch(() => {});
      await fs.rm(bundleLocation, { recursive: true, force: true }).catch(() => {});

      return { success: true, data: base64 };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Export failed' 
      };
    }
  });
}