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
    onProgress?: (progress: ExportProgress) => void
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

      // Apply zoom effect if enabled
      if (clip.effects?.zoom?.enabled && clip.effects.zoom.blocks?.length) {
        // For simplicity, apply a static zoom to the first target
        const firstBlock = clip.effects.zoom.blocks[0]
        if (firstBlock) {
          const scale = firstBlock.scale || 2
          const x = firstBlock.targetX || 0.5
          const y = firstBlock.targetY || 0.5

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