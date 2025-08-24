/**
 * FFmpeg-based export with effects
 * Uses FFmpeg.wasm for client-side video processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Project, Clip } from '@/types/project'
import type { ExportSettings } from '@/types'
import type { ExportProgress } from './export-engine'

export class FFmpegExportEngine {
  private ffmpeg: FFmpeg | null = null
  private loaded = false

  /**
   * Interpolate mouse position at a specific timestamp
   */
  private interpolateMousePosition(
    mouseEvents: Array<{ timestamp: number; mouseX: number; mouseY: number; captureWidth?: number; captureHeight?: number }>,
    targetTime: number
  ): { x: number; y: number } | null {
    if (!mouseEvents || mouseEvents.length === 0) return null

    // Find the two events that surround the target time
    let before = null
    let after = null

    for (let i = 0; i < mouseEvents.length; i++) {
      const event = mouseEvents[i]
      if (event.timestamp <= targetTime) {
        before = event
      } else if (!after) {
        after = event
        break
      }
    }

    // If we only have events after the target time, use the first one
    if (!before && after) {
      const captureWidth = after.captureWidth || 1920
      const captureHeight = after.captureHeight || 1080
      return {
        x: after.mouseX / captureWidth,
        y: after.mouseY / captureHeight
      }
    }

    // If we only have events before the target time, use the last one
    if (before && !after) {
      const captureWidth = before.captureWidth || 1920
      const captureHeight = before.captureHeight || 1080
      return {
        x: before.mouseX / captureWidth,
        y: before.mouseY / captureHeight
      }
    }

    // If we have both, interpolate between them
    if (before && after) {
      const timeDiff = after.timestamp - before.timestamp
      const targetDiff = targetTime - before.timestamp
      const t = timeDiff > 0 ? targetDiff / timeDiff : 0

      const captureWidth = before.captureWidth || after.captureWidth || 1920
      const captureHeight = before.captureHeight || after.captureHeight || 1080

      const x = before.mouseX + (after.mouseX - before.mouseX) * t
      const y = before.mouseY + (after.mouseY - before.mouseY) * t

      return {
        x: x / captureWidth,
        y: y / captureHeight
      }
    }

    return null
  }

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
    mouseEvents?: Array<{ timestamp: number; mouseX: number; mouseY: number; captureWidth?: number; captureHeight?: number }>
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
        // Crop to the captured area
        // Note: x and y are relative to the full screen recording
        filters.push(`crop=${captureArea.width}:${captureArea.height}:${captureArea.x}:${captureArea.y}`)
      }

      // Apply zoom effect if enabled
      if (clip.effects?.zoom?.enabled && clip.effects.zoom.blocks?.length) {
        // For simplicity, apply a static zoom to the first target
        const firstBlock = clip.effects.zoom.blocks[0]
        if (firstBlock) {
          const scale = firstBlock.scale || 2

          // Get mouse position at block start time for zoom center
          let x = 0.5  // Default to center
          let y = 0.5

          // Use interpolated mouse position for smooth zoom targeting
          const mousePos = this.interpolateMousePosition(mouseEvents || [], firstBlock.startTime)
          if (mousePos) {
            x = Math.max(0, Math.min(1, mousePos.x))
            y = Math.max(0, Math.min(1, mousePos.y))
          }

          // Zoom filter: scale and crop
          filters.push(`scale=${scale}*iw:${scale}*ih`)
          filters.push(`crop=iw/${scale}:ih/${scale}:${x}*iw:${y}*ih`)
        }
      }

      // Apply corner radius effect
      if (clip.effects?.video?.cornerRadius) {
        // FFmpeg doesn't have direct corner radius, but we can simulate with a mask
        // For now, skip this as it's complex
      }

      // Apply padding/background
      if (clip.effects?.background?.padding) {
        const padding = clip.effects.background.padding
        filters.push(`pad=iw+${padding * 2}:ih+${padding * 2}:${padding}:${padding}:color=black`)
      }

      // Build filter complex string
      const filterComplex = filters.length > 0 ? `-vf "${filters.join(',')}"` : ''

      // Determine output format and codec
      const outputName = `output.${settings.format}`
      let codecOptions = ''

      switch (settings.format) {
        case 'mp4':
          codecOptions = '-c:v libx264 -preset fast -crf 22'
          break
        case 'webm':
          codecOptions = '-c:v libvpx-vp9 -crf 30 -b:v 0'
          break
        case 'gif':
          codecOptions = ''
          filters.unshift('fps=10,scale=480:-1:flags=lanczos')
          break
      }

      onProgress?.({
        progress: 40,
        stage: 'encoding',
        message: 'Encoding video...'
      })

      // Run FFmpeg command
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

      // Read output file
      const data = await this.ffmpeg.readFile(outputName)

      // Convert to Blob - handle different possible return types
      const outputBlob = new Blob([data as BlobPart], {
        type: `video/${settings.format === 'gif' ? 'gif' : settings.format}`
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
}