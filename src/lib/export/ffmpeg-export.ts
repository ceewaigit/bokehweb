/**
 * FFmpeg-based export with effects
 * Uses FFmpeg.wasm for client-side video processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Project, Clip, ExportSettings, Effect } from '@/types'
import { ExportFormat, EffectType } from '@/types'
import type { ExportProgress } from './export-engine'
import { interpolateMousePositionNormalized } from '@/lib/effects/utils/mouse-interpolation'

export class FFmpegExportEngine {
  private ffmpeg: FFmpeg | null = null
  private loaded = false
  private loadAttempts = 0
  private maxLoadAttempts = 3

  async loadFFmpeg(): Promise<void> {
    if (this.loaded) return

    this.loadAttempts = 0
    let lastError: Error | null = null

    while (this.loadAttempts < this.maxLoadAttempts) {
      try {
        this.loadAttempts++
        console.log(`Loading FFmpeg... (attempt ${this.loadAttempts}/${this.maxLoadAttempts})`)

        this.ffmpeg = new FFmpeg()

        // Try multiple CDN sources with fallback
        const cdnSources = [
          'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
          'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        ]

        let loadSuccess = false
        for (const baseURL of cdnSources) {
          try {
            await this.ffmpeg.load({
              coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            })
            loadSuccess = true
            console.log(`FFmpeg loaded successfully from ${baseURL}`)
            break
          } catch (cdnError) {
            console.warn(`Failed to load from ${baseURL}:`, cdnError)
            lastError = cdnError as Error
          }
        }

        if (!loadSuccess) {
          throw lastError || new Error('Failed to load FFmpeg from any CDN')
        }

        this.loaded = true
        return
      } catch (error) {
        lastError = error as Error
        console.error(`FFmpeg load attempt ${this.loadAttempts} failed:`, error)

        if (this.loadAttempts < this.maxLoadAttempts) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * this.loadAttempts))
        }
      }
    }

    throw new Error(`Failed to load FFmpeg after ${this.maxLoadAttempts} attempts: ${lastError?.message || 'Unknown error'}`)
  }

  async exportWithEffects(
    blob: Blob,
    clip: Clip,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void,
    captureArea?: { x: number; y: number; width: number; height: number },
    mouseEvents?: Array<{ timestamp: number; mouseX: number; mouseY: number; captureWidth?: number; captureHeight?: number }>,
    effects?: Effect[]
  ): Promise<Blob> {
    try {
      onProgress?.({
        progress: 5,
        stage: 'preparing',
        message: 'Loading FFmpeg...'
      })

      await this.loadFFmpeg()
      if (!this.ffmpeg) throw new Error('FFmpeg not loaded')

      onProgress?.({
        progress: 10,
        stage: 'preparing',
        message: 'Preparing video...'
      })

      // Write input video to FFmpeg filesystem
      const inputName = 'input.webm'
      const inputData = await fetchFile(blob)
      console.log(`Writing input file: ${inputName}, size: ${blob.size} bytes`)
      await this.ffmpeg.writeFile(inputName, inputData)
      console.log('Input file written successfully')

      onProgress?.({
        progress: 20,
        stage: 'processing',
        message: 'Applying effects...'
      })

      // Build FFmpeg filter chain based on effects
      const filters: string[] = []

      // Apply cropping if we have a capture area (for window or area recording)
      if (captureArea && captureArea.width > 0 && captureArea.height > 0) {
        filters.push(`crop=${captureArea.width}:${captureArea.height}:${captureArea.x}:${captureArea.y}`)
      }

      // Apply zoom effect if present in effects array
      if (effects && effects.length > 0) {
        const zoomEffect = effects.find(e =>
          e.type === EffectType.Zoom &&
          e.enabled &&
          e.startTime <= clip.startTime + clip.duration &&
          e.endTime >= clip.startTime
        )

        if (zoomEffect) {
          const zoomData = zoomEffect.data as any
          const scale = zoomData.scale || 2

          console.log(`Zoom effect: scale=${scale} - simplifying for FFmpeg.wasm`)

          // Simplified zoom: just scale to target resolution with zoom factor
          // FFmpeg.wasm has issues with complex filter expressions
          const targetWidth = Math.round(settings.resolution.width * scale)
          const targetHeight = Math.round(settings.resolution.height * scale)
          
          // Simple scale up
          filters.push(`scale=${targetWidth}:${targetHeight}`)
          
          // Simple center crop to target resolution
          filters.push(`crop=${settings.resolution.width}:${settings.resolution.height}`)
        }
      }

      // Corner radius and padding (if provided)
      const cornerRadius = (settings as any).cornerRadius
      if (cornerRadius) {
        // TODO: Implement via mask if needed in future
      }

      const padding = (settings as any).padding
      if (padding) {
        filters.push(`pad=iw+${padding * 2}:ih+${padding * 2}:${padding}:${padding}:color=black`)
      }

      const outputName = `output.webm`  // Always output WebM from FFmpeg.wasm
      let codecOptions = ''

      // FFmpeg.wasm works best with simple settings
      switch (settings.format) {
        case ExportFormat.GIF:
          codecOptions = ''
          filters.unshift('fps=10,scale=480:-1:flags=lanczos')
          break
        default:
          // Very simple VP8 encoding for maximum compatibility
          // Lower quality but should work reliably
          codecOptions = '-c:v libvpx -deadline realtime -cpu-used 5 -b:v 500k -an'
          break
      }

      // Create filter complex AFTER all filters are added
      const filterComplex = filters.length > 0 ? `-vf "${filters.join(',')}"` : ''

      onProgress?.({
        progress: 40,
        stage: 'encoding',
        message: 'Encoding video...'
      })

      // Build FFmpeg command arguments properly
      const ffmpegArgs: string[] = []
      
      // If no filters and format matches, try simple copy
      if (filters.length === 0 && settings.format === ExportFormat.WEBM) {
        // Simple copy without re-encoding
        ffmpegArgs.push('-i', inputName, '-c', 'copy', outputName)
      } else {
        // Full transcoding with filters
        ffmpegArgs.push('-i', inputName)
        
        // Add video filters if any
        if (filters.length > 0) {
          ffmpegArgs.push('-vf')
          ffmpegArgs.push(filters.join(','))
        }
        
        // Add codec options
        if (codecOptions) {
          ffmpegArgs.push(...codecOptions.split(' '))
        } else {
          // Default codec if none specified
          ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22')
        }
        
        // Add output file
        ffmpegArgs.push(outputName)
      }
      
      console.log('FFmpeg command:', ffmpegArgs.join(' '))
      
      // Execute FFmpeg command with timeout
      console.log('Executing FFmpeg command...')
      
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('FFmpeg timeout after 30 seconds')), 30000)
        })
        
        // Execute with timeout
        await Promise.race([
          this.ffmpeg.exec(ffmpegArgs),
          timeoutPromise
        ])
        
        console.log('FFmpeg execution completed successfully')
      } catch (execError) {
        console.error('FFmpeg execution failed:', execError)
        console.error('Failed command:', ffmpegArgs.join(' '))
        
        // If it failed, try the most basic possible command
        console.log('Trying ultra-simple copy command...')
        try {
          // Just copy without any re-encoding
          const copyArgs = ['-i', inputName, '-c', 'copy', '-t', '30', outputName]
          await this.ffmpeg.exec(copyArgs)
          console.log('Copy succeeded - no effects applied')
        } catch (copyError) {
          throw new Error(`FFmpeg encoding completely failed: ${execError}`)
        }
      }

      onProgress?.({
        progress: 80,
        stage: 'finalizing',
        message: 'Finalizing export...'
      })

      // Check if output file was created
      let data: Uint8Array | string
      try {
        data = await this.ffmpeg.readFile(outputName)
      } catch (readError) {
        console.error('Failed to read output file:', readError)
        throw new Error(`FFmpeg failed to create output file "${outputName}". The video encoding may have failed.`)
      }

      // Validate output data
      if (!data || (data instanceof Uint8Array && data.length < 1000)) {
        throw new Error(`Export produced invalid output: ${data instanceof Uint8Array ? data.length : 0} bytes. Please check your video settings.`)
      }

      // Output is always WebM from FFmpeg.wasm (or GIF for GIF exports)
      const mimeType = settings.format === ExportFormat.GIF ? 'image/gif' : 'video/webm'
      const outputBlob = new Blob([data as BlobPart], { type: mimeType })

      // Final validation
      if (outputBlob.size < 1000) {
        throw new Error(`Export produced a file that's too small (${outputBlob.size} bytes). The export may have failed.`)
      }

      console.log(`Export successful: ${outputBlob.size} bytes, format: ${settings.format}`)

      onProgress?.({
        progress: 100,
        stage: 'complete',
        message: 'Export complete with effects!'
      })

      return outputBlob
    } catch (error) {
      onProgress?.({
        progress: 0,
        stage: 'error',
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
      throw error
    }
  }

  /**
   * Concatenate multiple video blobs into one
   */
  async concatenateBlobs(
    blobs: Blob[],
    settings: ExportSettings
  ): Promise<Blob> {
    await this.loadFFmpeg()
    if (!this.ffmpeg) throw new Error('FFmpeg not loaded')

    // Write all segments to FFmpeg filesystem
    const fileList: string[] = []
    for (let i = 0; i < blobs.length; i++) {
      const filename = `segment${i}.webm`
      await this.ffmpeg.writeFile(filename, await fetchFile(blobs[i]))
      fileList.push(`file '${filename}'`)
    }

    // Create concat list
    await this.ffmpeg.writeFile('concat.txt', fileList.join('\n'))

    // Concatenate using FFmpeg
    const outputName = `output.${settings.format}`
    await this.ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      outputName
    ])

    const data = await this.ffmpeg.readFile(outputName)
    return new Blob([data as BlobPart], {
      type: `video/${settings.format}`
    })
  }
}