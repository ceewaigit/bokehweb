/**
 * Export Worker Process with MessagePort IPC
 * Handles video export with supervision and error recovery
 * Optimized for memory efficiency using Remotion best practices
 */

import { BaseWorker } from './utils/base-worker';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { tmpdir } from 'os';

interface ChunkAssignment {
  index: number;
  startFrame: number;
  endFrame: number;
  startTimeMs: number;
  endTimeMs: number;
}

interface ExportJob {
  bundleLocation: string;
  compositionMetadata: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    id: string;
    defaultProps: any;
  };
  inputProps: any;
  outputPath: string;
  settings: {
    format?: string;
    framerate?: number;
    quality?: string;
    resolution?: { width: number; height: number };
  };
  offthreadVideoCacheSizeInBytes: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: string;
  useGPU: boolean;
  concurrency?: number;
  ffmpegPath: string;
  compositorDir: string | null;
  chunkSizeFrames?: number;
  assignedChunks?: ChunkAssignment[];
  totalChunks?: number;
  totalFrames?: number;
  combineChunksInWorker?: boolean;
  preFilteredMetadata?: Map<number, Map<string, any>>; // Pre-filtered metadata by chunk
}

class ExportWorker extends BaseWorker {
  private currentExport: {
    isActive: boolean;
    tempFiles: string[];
  } | null = null;

  protected onInit(): void {
    console.log('[ExportWorker] Initialized with MessagePort IPC');
  }

  protected async onRequest(method: string, data: any): Promise<any> {
    switch (method) {
      case 'export':
        return this.performExport(data);
      
      case 'status':
        return this.getStatus();
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  protected async onMessage(method: string, data: any): Promise<void> {
    switch (method) {
      case 'cancel':
        await this.cancelExport();
        break;
      
      default:
        console.warn(`[ExportWorker] Unknown message: ${method}`);
    }
  }

  protected async onShutdown(): Promise<void> {
    await this.cleanup();
  }

  private async performExport(job: ExportJob): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Initialize export state
      this.currentExport = {
        isActive: true,
        tempFiles: []
      };

      // Send progress updates
      this.send('progress', {
        progress: 5,
        stage: 'preparing',
        message: 'Initializing export...'
      });

      // Lazy load Remotion modules
      const { renderMedia } = await import('@remotion/renderer');
      
      // Use pre-selected composition metadata from main process
      if (!job.compositionMetadata) {
        throw new Error('Composition metadata is required');
      }
      
      const composition = {
        ...job.compositionMetadata,
        props: job.inputProps
      };
      
      console.log('[ExportWorker] Using pre-selected composition metadata');

      const fps = job.settings.framerate || composition.fps;
      const totalFrames = composition.durationInFrames;
      const durationInSeconds = totalFrames / fps;
      
      console.log(`[ExportWorker] Starting export: ${totalFrames} frames at ${fps}fps (${durationInSeconds.toFixed(1)}s)`);

      // Determine if we need chunked rendering
      const chunkAssignments = Array.isArray(job.assignedChunks) && job.assignedChunks.length > 0
        ? job.assignedChunks
        : null;

      const chunkSize = job.chunkSizeFrames ?? 2000; // ~1 minute at 30fps, ~33s at 60fps
      const needsChunking = totalFrames > chunkSize || !!chunkAssignments;

      if (needsChunking) {
        console.log(`[ExportWorker] Using chunked rendering for ${totalFrames} frames`);
        return await this.performChunkedExport(
          job,
          composition,
          totalFrames,
          chunkSize,
          startTime,
          chunkAssignments || undefined,
          job.combineChunksInWorker !== false
        );
      } else {
        console.log(`[ExportWorker] Using single-pass rendering for ${totalFrames} frames`);
        return await this.performSingleExport(job, composition, totalFrames, startTime);
      }

    } catch (error) {
      console.error('[ExportWorker] Export failed:', error);
      await this.cleanup();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async performSingleExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    startTime: number = Date.now()
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    
    const { renderMedia } = await import('@remotion/renderer');
    const renderConcurrency = Math.max(1, job.concurrency || 1);

    // Send progress updates
    this.send('progress', {
      progress: 10,
      stage: 'rendering',
      message: 'Starting render engine...'
    });

    let lastReportedFrame = 0;
    let lastProgressUpdate = Date.now();

    // Use renderMedia for memory-efficient single-pass rendering
    await renderMedia({
      serveUrl: job.bundleLocation,
      composition,
      inputProps: job.inputProps,
      outputLocation: job.outputPath,
      codec: 'h264',
      videoBitrate: job.videoBitrate,
      jpegQuality: job.jpegQuality,
      imageFormat: 'jpeg',
      concurrency: renderConcurrency,
      enforceAudioTrack: false, // Don't require audio track
      offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
      chromiumOptions: {
        gl: 'angle-egl', // Use angle-egl for better stability
        enableMultiProcessOnLinux: true,
        disableWebSecurity: false,
        ignoreCertificateErrors: false,
      },
      binariesDirectory: job.compositorDir,
      // Allow parallel encoding for better performance when memory permits
      disallowParallelEncoding: false,
      logLevel: 'verbose',
      onStart: ({ resolvedConcurrency, parallelEncoding }) => {
        console.log(`[ExportWorker] Rendering with concurrency=${resolvedConcurrency}, parallelEncoding=${parallelEncoding}`);
      },
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const now = Date.now();
        
        // Update progress at most every 500ms
        if (now - lastProgressUpdate > 500 || renderedFrames === totalFrames) {
          lastProgressUpdate = now;
          lastReportedFrame = renderedFrames;
          
          const progressPercent = 10 + Math.round((renderedFrames / totalFrames) * 85);
          
          this.send('progress', {
            progress: progressPercent,
            currentFrame: renderedFrames,
            totalFrames,
            stage: 'rendering',
            message: `Rendering frame ${renderedFrames} of ${totalFrames}`
          });
        }
      }
    });

    // Finalize
    this.send('progress', {
      progress: 95,
      stage: 'finalizing',
      message: 'Finalizing video...'
    });

    // Get file size
    const stats = await fs.stat(job.outputPath);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`[ExportWorker] Export complete in ${duration.toFixed(1)}s`);

    await this.cleanup();

    return {
      success: true,
      outputPath: job.outputPath
    };
  }

  private async performChunkedExport(
    job: ExportJob,
    composition: any,
    totalFrames: number,
    chunkSize: number,
    startTime: number = Date.now(),
    providedChunks?: ChunkAssignment[],
    combineChunksInWorker: boolean = true
  ): Promise<{ success: boolean; outputPath?: string; error?: string; chunkResults?: Array<{ index: number; path: string }> }> {

    const { renderMedia } = await import('@remotion/renderer');
    
    const chunks: string[] = [];
    const preservedChunkResults: Array<{ index: number; path: string }> = [];
      const renderConcurrency = Math.max(1, job.concurrency || 1);

      const chunkPlan: ChunkAssignment[] = providedChunks && providedChunks.length > 0
        ? [...providedChunks].sort((a, b) => a.index - b.index)
        : this.buildChunkPlan(totalFrames, chunkSize, job.settings.framerate || composition.fps || 30);

    const totalChunkCount = job.totalChunks ?? chunkPlan.length;
    const fps = job.settings.framerate || composition.fps || 30;
    const numChunks = chunkPlan.length;

    console.log(`[ExportWorker] Rendering ${numChunks} chunks of ${chunkSize} frames each (combine=${combineChunksInWorker})`);

    try {
      for (let i = 0; i < numChunks; i++) {
        const chunkInfo = chunkPlan[i];
        const startFrame = chunkInfo.startFrame;
        const endFrame = chunkInfo.endFrame;
        const chunkFrames = endFrame - startFrame + 1;

        if (chunkFrames <= 0) {
          console.warn(`[ExportWorker] Skipping empty chunk ${chunkInfo.index + 1}/${totalChunkCount}`);
          continue;
        }
        
        // Create temp file for this chunk
        const chunkPath = path.join(tmpdir(), `remotion-chunk-${i}-${Date.now()}.mp4`);
        chunks.push(chunkPath);
        if (combineChunksInWorker) {
          this.currentExport?.tempFiles.push(chunkPath);
        }
        
        console.log(`[ExportWorker] Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frames ${startFrame}-${endFrame}`);
        
        // Calculate time range for this chunk
        const chunkStartTimeMs = chunkInfo.startTimeMs;
        const chunkEndTimeMs = chunkInfo.endTimeMs;
        
        // Use pre-filtered metadata if available, otherwise filter on demand
        let chunkInputProps = { ...job.inputProps };
        let filteredMetadata: any = {};
        
        // Check if we have pre-filtered metadata for this chunk
        if (job.preFilteredMetadata && job.preFilteredMetadata instanceof Map) {
          const chunkMetadata = job.preFilteredMetadata.get(chunkInfo.index);
          if (chunkMetadata && chunkMetadata instanceof Map) {
            filteredMetadata = Object.fromEntries(chunkMetadata);
            console.log(`[ExportWorker] Using pre-filtered metadata for chunk ${chunkInfo.index + 1}`);
          }
        }
        
        if (job.inputProps.segments && Array.isArray(job.inputProps.segments)) {
          const allSegments = job.inputProps.segments;
          const chunkSegments = allSegments.filter((segment: any) => {
            // Include segment if it overlaps with this chunk's time range
            const segmentStartMs = segment.startTime;
            const segmentEndMs = segment.endTime;
            return segmentEndMs >= chunkStartTimeMs && segmentStartMs <= chunkEndTimeMs;
          });
          
          // Extract only the recording IDs used in this chunk
          const recordingIds = new Set<string>();
          chunkSegments.forEach((segment: any) => {
            if (segment.clips && Array.isArray(segment.clips)) {
              segment.clips.forEach((clipData: any) => {
                if (clipData.recording?.id) {
                  recordingIds.add(clipData.recording.id);
                }
              });
            }
          });
          
          console.log(`[ExportWorker] Chunk ${chunkInfo.index + 1}: Using ${recordingIds.size} recordings`);
          
          const trimmedSegments = chunkSegments.map((segment: any) => {
            const trimmedSegmentStart = Math.max(chunkStartTimeMs, segment.startTime);
            const trimmedSegmentEnd = Math.min(chunkEndTimeMs, segment.endTime);

            if (!Number.isFinite(trimmedSegmentStart) || !Number.isFinite(trimmedSegmentEnd) || trimmedSegmentEnd <= trimmedSegmentStart) {
              return null;
            }

            const trimmedClips = (segment.clips || [])
              .map((clipData: any) => {
                if (!clipData?.clip) {
                  return null;
                }

                const clipStartAbs = clipData.clip.startTime + (clipData.segmentStartTime || 0);
                const clipEndAbs = clipData.clip.startTime + (clipData.segmentEndTime || 0);

                const clippedStart = Math.max(chunkStartTimeMs, clipStartAbs);
                const clippedEnd = Math.min(chunkEndTimeMs, clipEndAbs);

                if (!Number.isFinite(clippedStart) || !Number.isFinite(clippedEnd) || clippedEnd <= clippedStart) {
                  return null;
                }

                const clipRelativeStart = Math.max(0, clippedStart - clipData.clip.startTime);
                const clipRelativeEnd = Math.max(0, clippedEnd - clipData.clip.startTime);

                return {
                  ...clipData,
                  segmentStartTime: clipRelativeStart,
                  segmentEndTime: clipRelativeEnd
                };
              })
              .filter(Boolean);

            if (trimmedClips.length === 0) {
              return null;
            }

            const trimmedEffects = (segment.effects || [])
              .filter((effect: any) => effect && effect.endTime > chunkStartTimeMs && effect.startTime < chunkEndTimeMs)
              .map((effect: any) => ({ ...effect }));

            return {
              ...segment,
              startTime: trimmedSegmentStart - chunkStartTimeMs,
              endTime: trimmedSegmentEnd - chunkStartTimeMs,
              clips: trimmedClips,
              effects: trimmedEffects
            };
          }).filter(Boolean);
          
          // Only filter metadata if not pre-filtered
          if (Object.keys(filteredMetadata).length === 0) {
            console.log(`[ExportWorker] Filtering metadata on-demand for chunk ${chunkInfo.index + 1}`);
            for (const [recordingId, metadata] of Object.entries(job.inputProps.metadata || {})) {
              if (recordingIds.has(recordingId) && metadata) {
                const metadataObj = metadata as any;
                const filtered: any = {
                  ...metadataObj,
                  events: []
                };
                
                // Simple time range filter for essential events only
                const eventArrayKeys = ['events', 'cursor', 'keyboard', 'clicks', 'scrolls'];
                for (const key of eventArrayKeys) {
                  if (Array.isArray(metadataObj[key])) {
                    filtered[key] = metadataObj[key]
                      .filter((item: any) => {
                        const eventTime = item.timestamp ?? item.time ?? 0;
                        return eventTime >= chunkStartTimeMs && eventTime <= chunkEndTimeMs;
                      })
                      .map((item: any) => {
                        const eventTime = item.timestamp ?? item.time ?? 0;
                        return {
                          ...item,
                          timestamp: eventTime - chunkStartTimeMs,
                          time: eventTime - chunkStartTimeMs
                        };
                      });
                  }
                }
                
                filteredMetadata[recordingId] = filtered;
              }
            }
          }
          
          // Filter data to only what's needed for this chunk
          chunkInputProps = {
            segments: trimmedSegments,
            recordings: Object.fromEntries(
              Object.entries(job.inputProps.recordings || {})
                .filter(([id]) => recordingIds.has(id))
            ),
            metadata: filteredMetadata,
            videoUrls: Object.fromEntries(
              Object.entries(job.inputProps.videoUrls || {})
                .filter(([id]) => recordingIds.has(id))
            ),
            framerate: job.inputProps.framerate,
            resolution: job.inputProps.resolution,
            quality: job.inputProps.quality
          };
          
          console.log(`[ExportWorker] Chunk ${chunkInfo.index + 1}: Filtered to ${trimmedSegments.length} segments from ${allSegments.length} total`);
        }

        // Update progress
        const baseProgress = (chunkInfo.index / Math.max(1, totalChunkCount)) * 80;
        this.send('progress', {
          progress: 10 + Math.round(baseProgress),
          stage: 'rendering',
          message: `Rendering chunk ${chunkInfo.index + 1} of ${totalChunkCount}...`,
          currentFrame: startFrame,
          totalFrames,
          chunkIndex: chunkInfo.index,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: 0,
          chunkTotalFrames: chunkFrames,
          chunkStartFrame: startFrame,
          chunkEndFrame: endFrame
        });

        // Render this chunk with filtered segments
        const chunkComposition = {
          ...composition,
          durationInFrames: chunkFrames,
          props: chunkInputProps,
        };

        await renderMedia({
          serveUrl: job.bundleLocation,
          composition: chunkComposition,
          inputProps: chunkInputProps,
          outputLocation: chunkPath,
          codec: 'h264',
          videoBitrate: job.videoBitrate,
          jpegQuality: job.jpegQuality,
          imageFormat: 'jpeg',
          frameRange: [0, chunkFrames - 1],
          concurrency: renderConcurrency,
          enforceAudioTrack: false, // Don't require audio track
          offthreadVideoCacheSizeInBytes: job.offthreadVideoCacheSizeInBytes,
          chromiumOptions: {
            gl: 'angle-egl', // Use angle-egl for better stability
            enableMultiProcessOnLinux: true,
            disableWebSecurity: false,
            ignoreCertificateErrors: false,
          },
          binariesDirectory: job.compositorDir,
          disallowParallelEncoding: false,
          logLevel: 'info',
          onProgress: ({ renderedFrames }) => {
            const chunkProgress = renderedFrames / chunkFrames;
            const totalProgress = 10 + ((chunkInfo.index + chunkProgress) / Math.max(1, totalChunkCount)) * 80;
            
            this.send('progress', {
              progress: Math.round(totalProgress),
              currentFrame: startFrame + renderedFrames,
              totalFrames,
              stage: 'rendering',
              message: `Rendering chunk ${chunkInfo.index + 1}/${totalChunkCount}: frame ${renderedFrames}/${chunkFrames}`,
              chunkIndex: chunkInfo.index,
              chunkCount: totalChunkCount,
              chunkRenderedFrames: renderedFrames,
              chunkTotalFrames: chunkFrames,
              chunkStartFrame: startFrame,
              chunkEndFrame: endFrame
            });
          }
        });

        // Force garbage collection between chunks if available
        if (global.gc) {
          global.gc();
        }
      }

      if (!combineChunksInWorker) {
        preservedChunkResults.push(...chunks.map((chunkPath, idx) => ({
          index: chunkPlan[idx].index,
          path: chunkPath
        })));

        const lastChunk = chunkPlan[chunkPlan.length - 1];
        const lastChunkFrames = lastChunk ? lastChunk.endFrame - lastChunk.startFrame + 1 : 0;

        this.send('progress', {
          progress: Math.min(90, 10 + Math.round(((lastChunk?.index ?? 0) + 1) / Math.max(1, totalChunkCount) * 80)),
          stage: 'rendering',
          message: 'Chunk rendering complete',
          chunkIndex: lastChunk?.index ?? 0,
          chunkCount: totalChunkCount,
          chunkRenderedFrames: lastChunkFrames,
          chunkTotalFrames: lastChunkFrames,
          chunkStartFrame: lastChunk?.startFrame ?? 0,
          chunkEndFrame: lastChunk?.endFrame ?? 0
        });

        await this.cleanup();

        return {
          success: true,
          chunkResults: preservedChunkResults.sort((a, b) => a.index - b.index)
        };
      }

      // Combine chunks
      this.send('progress', {
        progress: 90,
        stage: 'finalizing',
        message: 'Combining video chunks...'
      });

      console.log(`[ExportWorker] Combining ${chunks.length} chunks into final video`);
      
      // Use FFmpeg directly to concatenate videos
      const concatListPath = path.join(tmpdir(), `concat-${Date.now()}.txt`);
      this.currentExport?.tempFiles.push(concatListPath);
      
      // Create concat file
      const concatContent = chunks.map(chunk => `file '${chunk}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);
      
      // Run FFmpeg concat
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        job.outputPath
      ];
      
      const ffmpegProcess = spawn(job.ffmpegPath, ffmpegArgs);
      
      await new Promise<void>((resolve, reject) => {
        ffmpegProcess.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg concat failed with code ${code}`));
          }
        });
        ffmpegProcess.on('error', reject);
      });

      // Clean up chunk files
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => {});
      }

      this.send('progress', {
        progress: 95,
        stage: 'finalizing',
        message: 'Finalizing video...'
      });

      await this.cleanup();

      return {
        success: true,
        outputPath: job.outputPath
      };

    } catch (error) {
      // Clean up chunk files on error
      for (const chunk of chunks) {
        await fs.unlink(chunk).catch(() => {});
      }
      throw error;
    }
  }

  private buildChunkPlan(totalFrames: number, chunkSize: number, fps: number): ChunkAssignment[] {
    const numChunks = Math.ceil(totalFrames / chunkSize);
    const plan: ChunkAssignment[] = [];

    for (let index = 0; index < numChunks; index++) {
      const startFrame = index * chunkSize;
      const endFrame = Math.min(startFrame + chunkSize - 1, totalFrames - 1);
      const startTimeMs = (startFrame / fps) * 1000;
      const endTimeMs = ((endFrame + 1) / fps) * 1000;

      plan.push({
        index,
        startFrame,
        endFrame,
        startTimeMs,
        endTimeMs
      });
    }

    return plan;
  }

  private async cancelExport(): Promise<void> {
    console.log('[ExportWorker] Cancelling export...');
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (!this.currentExport) return;

    // Clean up any temp files
    for (const tempFile of this.currentExport.tempFiles) {
      await fs.unlink(tempFile).catch(() => {});
    }

    this.currentExport = null;
  }

  private getStatus(): { isExporting: boolean } {
    return {
      isExporting: this.currentExport?.isActive || false
    };
  }
}

// Create and start the worker
const worker = new ExportWorker();
console.log('[ExportWorker] Worker process started');
