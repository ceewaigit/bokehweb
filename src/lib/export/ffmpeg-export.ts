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

  async loadFFmpeg(): Promise<void> {
    if (this.loaded) return

    this.ffmpeg = new FFmpeg()

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    this.loaded = true
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
      await this.ffmpeg.writeFile(inputName, await fetchFile(blob))

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

          // Use shared interpolation for normalized mouse position
          let nx = 0.5
          let ny = 0.5
          if (mouseEvents && mouseEvents.length > 0) {
            const normalized = interpolateMousePositionNormalized(
              mouseEvents.map(e => ({
                timestamp: e.timestamp,
                x: e.mouseX,
                y: e.mouseY,
                screenWidth: e.captureWidth || 1920,
                screenHeight: e.captureHeight || 1080,
                captureWidth: e.captureWidth,
                captureHeight: e.captureHeight
              })) as any,
              zoomEffect.startTime
            )
            if (normalized) {
              nx = normalized.x
              ny = normalized.y
            }
          }

          // Zoom filter: scale and crop centered at normalized mouse position
          filters.push(`scale=${scale}*iw:${scale}*ih`)
          filters.push(`crop=iw/${scale}:ih/${scale}:${nx}*iw:${ny}*ih`)
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

      const filterComplex = filters.length > 0 ? `-vf "${filters.join(',')}"` : ''

      const outputName = `output.${settings.format}`
      let codecOptions = ''

      switch (settings.format) {
        case ExportFormat.MP4:
        case ExportFormat.MOV:
          codecOptions = '-c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k'
          break
        case ExportFormat.WEBM:
          codecOptions = '-c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k'
          break
        case ExportFormat.GIF:
          codecOptions = ''
          filters.unshift('fps=10,scale=480:-1:flags=lanczos')
          break
      }

      onProgress?.({
        progress: 40,
        stage: 'encoding',
        message: 'Encoding video...'
      })

      await this.ffmpeg.exec([
        '-i', inputName,
        ...filterComplex.split(' '),
        ...codecOptions.split(' '),
        outputName
      ])

      onProgress?.({
        progress: 80,
        stage: 'finalizing',
        message: 'Finalizing export...'
      })

      const data = await this.ffmpeg.readFile(outputName)
      const outputBlob = new Blob([data as BlobPart], {
        type: `video/${settings.format === ExportFormat.GIF ? 'gif' : settings.format}`
      })

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