import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'

export class FFmpegConverter {
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
      console.log('✅ FFmpeg converter loaded')
    } catch (error) {
      console.error('❌ Failed to load FFmpeg:', error)
      throw new Error('Failed to initialize FFmpeg')
    }
  }

  async convertWebMToMP4(
    webmBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    try {
      // Write input file
      await this.ffmpeg.writeFile('input.webm', await fetchFile(webmBlob))

      // Set up progress monitoring
      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(progress)
      })

      // Convert to MP4 with high quality settings
      await this.ffmpeg.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        'output.mp4'
      ])

      // Read output file
      const data = await this.ffmpeg.readFile('output.mp4')
      const mp4Blob = new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' })

      // Cleanup
      await this.ffmpeg.deleteFile('input.webm')
      await this.ffmpeg.deleteFile('output.mp4')

      return mp4Blob
    } catch (error) {
      console.error('❌ FFmpeg conversion failed:', error)
      throw error
    }
  }

  async convertWebMToMOV(
    webmBlob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    try {
      await this.ffmpeg.writeFile('input.webm', await fetchFile(webmBlob))

      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(progress)
      })

      // Convert to MOV with ProRes for better quality
      await this.ffmpeg.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-f', 'mov',
        'output.mov'
      ])

      const data = await this.ffmpeg.readFile('output.mov')
      const movBlob = new Blob([data as unknown as ArrayBuffer], { type: 'video/quicktime' })

      await this.ffmpeg.deleteFile('input.webm')
      await this.ffmpeg.deleteFile('output.mov')

      return movBlob
    } catch (error) {
      console.error('❌ FFmpeg MOV conversion failed:', error)
      throw error
    }
  }

  async convertToGIF(
    videoBlob: Blob,
    options: {
      width?: number
      height?: number
      fps?: number
    } = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.isLoaded) await this.initialize()

    const { width = 480, height = 360, fps = 15 } = options

    try {
      await this.ffmpeg.writeFile('input.video', await fetchFile(videoBlob))

      this.ffmpeg.on('progress', ({ progress }) => {
        onProgress?.(progress)
      })

      // Generate palette for better quality GIF
      await this.ffmpeg.exec([
        '-i', 'input.video',
        '-vf', `fps=${fps},scale=${width}:${height}:flags=lanczos,palettegen`,
        'palette.png'
      ])

      // Convert to GIF using the palette
      await this.ffmpeg.exec([
        '-i', 'input.video',
        '-i', 'palette.png',
        '-filter_complex', `fps=${fps},scale=${width}:${height}:flags=lanczos[x];[x][1:v]paletteuse`,
        'output.gif'
      ])

      const data = await this.ffmpeg.readFile('output.gif')
      const gifBlob = new Blob([data as unknown as ArrayBuffer], { type: 'image/gif' })

      // Cleanup
      await this.ffmpeg.deleteFile('input.video')
      await this.ffmpeg.deleteFile('palette.png')
      await this.ffmpeg.deleteFile('output.gif')

      return gifBlob
    } catch (error) {
      console.error('❌ FFmpeg GIF conversion failed:', error)
      throw error
    }
  }
}