import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'
import type { ExportSettings, Project } from '@/types'
import { globalBlobManager } from '../security/blob-url-manager'

export interface ExportProgress {
  progress: number
  stage: 'preparing' | 'encoding' | 'finalizing' | 'complete' | 'error'
  message: string
}

export class ExportEngine {
  private ffmpeg: FFmpeg
  private isLoaded = false

  constructor() {
    this.ffmpeg = new FFmpeg()
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      this.isLoaded = true
      console.log('✅ FFmpeg loaded')
    } catch (error) {
      console.error('❌ Failed to load FFmpeg:', error)
      throw new Error('Failed to initialize FFmpeg')
    }
  }

  // Simplified export using FFmpeg directly
  async exportProject(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    const videoClips = project.clips.filter(clip => clip.type === 'video')
    if (videoClips.length === 0) {
      throw new Error('No video clips to export')
    }

    onProgress?.({ progress: 0, stage: 'preparing', message: 'Loading clips...' })

    // Load clips into FFmpeg
    for (let i = 0; i < videoClips.length; i++) {
      const clip = videoClips[i]
      try {
        const videoData = await fetchFile(clip.source)
        await this.ffmpeg.writeFile(`input_${i}.mp4`, videoData)
      } catch (error) {
        console.warn(`Failed to load ${clip.name}:`, error)
      }
    }

    onProgress?.({ progress: 40, stage: 'encoding', message: 'Processing video...' })

    // Simple FFmpeg command
    const outputFile = `output.${settings.format}`
    const ffmpegArgs = [
      '-i', 'input_0.mp4',
      '-c:v', 'libx264',
      '-crf', '23',
      '-s', `${settings.resolution.width}x${settings.resolution.height}`,
      '-r', settings.framerate.toString(),
      outputFile
    ]

    // Monitor progress
    this.ffmpeg.on('progress', ({ progress }) => {
      // Clamp progress between 0 and 100 to prevent negative percentages
      const validProgress = Math.max(0, Math.min(100, progress || 0))
      const overallProgress = 40 + (validProgress * 0.01) * 50 // Maps 0-100% to 40-90%

      onProgress?.({
        progress: Math.round(overallProgress),
        stage: 'encoding',
        message: `Encoding... ${Math.round(validProgress)}%`
      })
    })

    await this.ffmpeg.exec(ffmpegArgs)

    onProgress?.({ progress: 90, stage: 'finalizing', message: 'Finalizing...' })

    const outputData = await this.ffmpeg.readFile(outputFile)
    const blob = new Blob([outputData as unknown as ArrayBuffer], { type: this.getMimeType(settings.format) })

    // Cleanup
    await this.cleanup(videoClips.length, outputFile)

    onProgress?.({ progress: 100, stage: 'complete', message: 'Export complete!' })
    return blob
  }

  async exportAsGIF(
    project: Project,
    settings: ExportSettings,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    const gifSettings = {
      ...settings,
      format: 'gif' as const,
      resolution: {
        width: Math.min(settings.resolution.width, 800),
        height: Math.min(settings.resolution.height, 600)
      },
      framerate: Math.min(settings.framerate, 15)
    }

    return this.exportProject(project, gifSettings, onProgress)
  }

  async saveFile(blob: Blob, filename: string): Promise<void> {
    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && window.electronAPI?.showSaveDialog && window.electronAPI?.saveFile) {
      try {
        // Use Electron's native save dialog
        const result = await window.electronAPI.showSaveDialog({
          defaultPath: filename,
          filters: [
            { name: 'Video Files', extensions: ['mp4', 'webm', 'mov'] },
            { name: 'GIF Files', extensions: ['gif'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })

        if (!result.canceled && result.filePath) {
          // Convert blob to buffer and save via IPC
          const buffer = await blob.arrayBuffer()
          const saveResult = await window.electronAPI.saveFile(
            Array.from(new Uint8Array(buffer)),
            result.filePath
          )

          if (saveResult.success) {
            console.log('✅ File saved via Electron:', result.filePath)
            return
          } else {
            console.error('Failed to save file:', saveResult.error)
          }
        }
      } catch (error) {
        console.error('Failed to save via Electron, falling back to browser download:', error)
      }
    }

    // Fallback to browser download
    const url = globalBlobManager.create(blob, 'export-download')
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    // Clean up after download
    setTimeout(() => globalBlobManager.revoke(url), 1000)
  }

  getPresetSettings(preset: string): Partial<ExportSettings> {
    const presets = {
      'youtube-1080p': {
        resolution: { width: 1920, height: 1080 },
        framerate: 60,
        format: 'mp4' as const,
        quality: 'high' as const
      },
      'youtube-720p': {
        resolution: { width: 1280, height: 720 },
        framerate: 60,
        format: 'mp4' as const,
        quality: 'high' as const
      },
      'twitter': {
        resolution: { width: 1280, height: 720 },
        framerate: 30,
        format: 'mp4' as const,
        quality: 'medium' as const
      },
      'instagram': {
        resolution: { width: 1080, height: 1080 },
        framerate: 30,
        format: 'mp4' as const,
        quality: 'high' as const
      },
      'prores-mov': {
        resolution: { width: 1920, height: 1080 },
        framerate: 60,
        format: 'mov' as any,
        quality: 'ultra' as const
      },
      'gif-small': {
        resolution: { width: 480, height: 360 },
        framerate: 15,
        format: 'gif' as const,
        quality: 'medium' as const
      }
    }

    return presets[preset as keyof typeof presets] || {}
  }

  private getMimeType(format: string): string {
    const mimeTypes = {
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'webm': 'video/webm',
      'gif': 'image/gif'
    }
    return mimeTypes[format as keyof typeof mimeTypes] || 'video/mp4'
  }

  private async cleanup(clipCount: number, outputFile: string): Promise<void> {
    try {
      for (let i = 0; i < clipCount; i++) {
        await this.ffmpeg.deleteFile(`input_${i}.mp4`)
      }
      await this.ffmpeg.deleteFile(outputFile)
    } catch (error) {
      console.warn('Cleanup failed:', error)
    }
  }

  static isSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' &&
      typeof WebAssembly !== 'undefined'
  }
}