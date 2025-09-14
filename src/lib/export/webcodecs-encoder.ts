/**
 * WebCodecs-based video encoder with proper container muxing
 * Produces valid MP4/WebM files that play in all media players
 */

import { logger } from '@/lib/utils/logger'
import type { ExportSettings } from '@/types'
import { ExportFormat, QualityLevel } from '@/types'
import * as MP4Box from 'mp4box'
import WebMMuxer from 'webm-muxer'

export interface EncoderConfig {
  codec: string
  width: number
  height: number
  bitrate: number
  framerate: number
  keyFrameInterval?: number
}

export interface EncodedChunk {
  type: 'key' | 'delta'
  timestamp: number
  duration?: number
  data: ArrayBuffer
}

export class WebCodecsEncoder {
  private encoder: VideoEncoder | null = null
  private frameCount = 0
  private encoderConfig: EncoderConfig | null = null
  private onProgress?: (progress: number) => void
  private isEncoding = false
  
  // Muxers
  private mp4File: any = null
  private webmMuxer: any = null
  private outputFormat: ExportFormat = ExportFormat.MP4
  private videoTrackId: number = 1
  private muxedChunks: Uint8Array[] = []
  
  // Frame caching for performance
  private frameCache = new Map<string, ImageBitmap>()
  private maxCacheSize = 100 // Cache up to 100 frames
  
  /**
   * Check if WebCodecs is supported
   */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && 
           typeof VideoDecoder !== 'undefined'
  }
  
  /**
   * Get optimal codec for format
   */
  private async getCodecForFormat(format: ExportFormat): Promise<string> {
    const h264Codecs = [
      'avc1.42001E',  // Baseline
      'avc1.4D401E',  // Main
      'avc1.64001E'   // High
    ]
    
    const vp9Codecs = [
      'vp09.00.10.08',
      'vp9'
    ]
    
    const vp8Codecs = ['vp8']
    
    // Select codec list based on format
    let codecList: string[] = []
    if (format === ExportFormat.MP4 || format === ExportFormat.MOV) {
      codecList = h264Codecs
    } else if (format === ExportFormat.WEBM) {
      codecList = [...vp9Codecs, ...vp8Codecs]
    }
    
    // Test each codec
    for (const codec of codecList) {
      const config = {
        codec,
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30
      }
      
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        logger.info(`Selected codec: ${codec} for format: ${format}`)
        return codec
      }
    }
    
    throw new Error(`No supported codec found for format: ${format}`)
  }
  
  /**
   * Calculate bitrate based on quality settings
   */
  private calculateBitrate(settings: ExportSettings): number {
    const pixels = settings.resolution.width * settings.resolution.height
    const baseRate = pixels * 0.1 * (settings.framerate / 30)
    
    const multipliers = {
      [QualityLevel.Low]: 0.5,
      [QualityLevel.Medium]: 1,
      [QualityLevel.High]: 2,
      [QualityLevel.Ultra]: 3,
      [QualityLevel.Custom]: 1
    }
    
    const multiplier = multipliers[settings.quality] || 1
    const bitrate = settings.quality === QualityLevel.Custom && settings.bitrate
      ? settings.bitrate
      : Math.floor(baseRate * multiplier)
    
    return bitrate
  }
  
  /**
   * Initialize MP4 muxer
   */
  private initializeMP4Muxer(): void {
    this.mp4File = MP4Box.createFile()
    this.muxedChunks = []
    
    // Set up streaming output
    this.mp4File.onSegment = (id: number, user: any, buffer: ArrayBuffer) => {
      this.muxedChunks.push(new Uint8Array(buffer))
    }
    
    // Initialize with moov for streaming
    this.mp4File.initializeSegmentation()
  }
  
  /**
   * Initialize WebM muxer
   */
  private async initializeWebMMuxer(): Promise<void> {
    const { Muxer, StreamTarget } = await import('webm-muxer')
    
    this.muxedChunks = []
    
    // Create a StreamTarget that collects chunks
    const target = new StreamTarget({
      onData: (chunk: Uint8Array) => {
        this.muxedChunks.push(chunk)
      }
    })
    
    this.webmMuxer = new Muxer({
      target,
      video: {
        codec: this.encoderConfig!.codec.includes('vp9') ? 'V_VP9' : 'V_VP8',
        width: this.encoderConfig!.width,
        height: this.encoderConfig!.height,
        frameRate: this.encoderConfig!.framerate
      },
      firstTimestampBehavior: 'offset'
    })
  }
  
  /**
   * Initialize the encoder with settings
   */
  async initialize(settings: ExportSettings, onProgress?: (progress: number) => void): Promise<void> {
    if (!WebCodecsEncoder.isSupported()) {
      throw new Error('WebCodecs not supported in this browser')
    }
    
    if (this.encoder) {
      throw new Error('Encoder already initialized')
    }
    
    this.onProgress = onProgress
    this.outputFormat = settings.format
    
    // Get appropriate codec
    const codec = await this.getCodecForFormat(settings.format)
    
    // Create encoder config
    this.encoderConfig = {
      codec,
      width: settings.resolution.width,
      height: settings.resolution.height,
      bitrate: this.calculateBitrate(settings),
      framerate: settings.framerate || 30,
      keyFrameInterval: 60  // Keyframe every 2 seconds at 30fps
    }
    
    // Initialize appropriate muxer
    if (settings.format === ExportFormat.MP4 || settings.format === ExportFormat.MOV) {
      this.initializeMP4Muxer()
    } else if (settings.format === ExportFormat.WEBM) {
      await this.initializeWebMMuxer()
    }
    
    // Create encoder
    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => this.handleEncodedChunk(chunk, metadata),
      error: (error) => this.handleEncoderError(error)
    })
    
    // Configure encoder
    const config: VideoEncoderConfig = {
      codec,
      width: this.encoderConfig.width,
      height: this.encoderConfig.height,
      bitrate: this.encoderConfig.bitrate,
      framerate: this.encoderConfig.framerate,
      latencyMode: 'quality',
      hardwareAcceleration: 'prefer-hardware'
    }
    
    // Add codec-specific settings
    if (codec.includes('avc')) {
      config.avc = { format: 'avc' }
    }
    
    await this.encoder.configure(config)
    
    logger.info(`WebCodecs encoder initialized: ${codec} ${this.encoderConfig.width}x${this.encoderConfig.height} @ ${this.encoderConfig.bitrate}bps`)
  }
  
  /**
   * Handle encoded video chunks
   */
  private handleEncodedChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
    const data = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(data)
    
    if (this.mp4File) {
      // Add to MP4 muxer
      this.handleMP4Chunk(chunk, data, metadata)
    } else if (this.webmMuxer) {
      // Add to WebM muxer
      this.webmMuxer.addVideoChunk(chunk, metadata)
    }
    
    // Progress callback
    if (this.onProgress && this.frameCount % 10 === 0) {
      this.onProgress(this.frameCount)
    }
  }
  
  /**
   * Handle MP4 muxing
   */
  private handleMP4Chunk(chunk: EncodedVideoChunk, data: ArrayBuffer, metadata?: EncodedVideoChunkMetadata): void {
    // On first keyframe, add video track with decoder config
    if (this.frameCount === 0 && chunk.type === 'key' && metadata?.decoderConfig) {
      const trackOptions: any = {
        id: this.videoTrackId,
        type: 'video',
        timescale: 1000000, // microseconds
        duration: 0, // Will be set later
        width: this.encoderConfig!.width,
        height: this.encoderConfig!.height,
        brands: ['isom', 'iso2', 'mp41'],
        description_boxes: []
      }
      
      // Add AVC decoder config if available
      if (metadata.decoderConfig.description) {
        const desc = metadata.decoderConfig.description
        const descArray = desc instanceof Uint8Array ? desc : new Uint8Array(desc as ArrayBuffer)
        trackOptions.description_boxes.push({
          type: 'avcC',
          size: descArray.length + 8,
          data: descArray
        })
      }
      
      this.videoTrackId = this.mp4File.addTrack(trackOptions)
    }
    
    // Add sample
    const sample = {
      track_id: this.videoTrackId,
      data,
      duration: chunk.duration || (1000000 / this.encoderConfig!.framerate),
      dts: chunk.timestamp,
      cts: chunk.timestamp,
      is_sync: chunk.type === 'key'
    }
    
    this.mp4File.addSample(this.videoTrackId, data, sample)
  }
  
  /**
   * Handle encoder errors
   */
  private handleEncoderError(error: Error): void {
    logger.error('Encoder error:', error)
    this.isEncoding = false
  }
  
  /**
   * Get cached frame or create new one
   */
  private async getCachedFrame(
    imageData: ImageData | ImageBitmap | VideoFrame,
    cacheKey: string
  ): Promise<ImageBitmap> {
    // Check cache first
    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!
    }
    
    // Create new bitmap
    let bitmap: ImageBitmap
    if (imageData instanceof ImageBitmap) {
      bitmap = imageData
    } else if (imageData instanceof VideoFrame) {
      bitmap = await createImageBitmap(imageData)
    } else {
      bitmap = await createImageBitmap(imageData as ImageData)
    }
    
    // Add to cache with size limit
    if (this.frameCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.frameCache.keys().next().value
      if (firstKey !== undefined) {
        const oldBitmap = this.frameCache.get(firstKey)
        oldBitmap?.close()
        this.frameCache.delete(firstKey)
      }
    }
    
    this.frameCache.set(cacheKey, bitmap)
    return bitmap
  }
  
  /**
   * Encode a single frame with caching
   */
  async encodeFrame(
    imageData: ImageData | ImageBitmap | VideoFrame,
    timestamp: number,
    cacheKey?: string
  ): Promise<void> {
    if (!this.encoder || this.encoder.state === 'closed') {
      throw new Error('Encoder not initialized or closed')
    }
    
    this.isEncoding = true
    
    // Use cache for repeated frames
    let frameBitmap: ImageBitmap | VideoFrame
    if (cacheKey && !(imageData instanceof VideoFrame)) {
      frameBitmap = await this.getCachedFrame(imageData, cacheKey)
    } else if (imageData instanceof VideoFrame) {
      frameBitmap = imageData
    } else if (imageData instanceof ImageBitmap) {
      frameBitmap = imageData
    } else {
      frameBitmap = await createImageBitmap(imageData as ImageData)
    }
    
    // Create VideoFrame
    const frame = frameBitmap instanceof VideoFrame 
      ? frameBitmap
      : new VideoFrame(frameBitmap, {
          timestamp: timestamp * 1000, // Convert to microseconds
          duration: (1000000 / (this.encoderConfig?.framerate || 30))
        })
    
    // Determine if this should be a keyframe
    const isKeyFrame = this.frameCount % (this.encoderConfig?.keyFrameInterval || 60) === 0
    
    // Encode frame
    this.encoder.encode(frame, { keyFrame: isKeyFrame })
    
    // Clean up if we created a new frame
    if (frame !== imageData && !(imageData instanceof VideoFrame)) {
      frame.close()
    }
    
    // Clean up bitmap if not cached
    if (!cacheKey && frameBitmap instanceof ImageBitmap && frameBitmap !== imageData) {
      frameBitmap.close()
    }
    
    this.frameCount++
  }
  
  /**
   * Encode multiple frames with batching
   */
  async encodeFrames(frames: Array<{ data: ImageData | ImageBitmap | VideoFrame; timestamp: number }>): Promise<void> {
    const batchSize = 30 // Process 30 frames at a time
    
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize)
      
      // Process batch in parallel
      await Promise.all(batch.map(async (frame, index) => {
        const cacheKey = `frame_${i + index}`
        await this.encodeFrame(frame.data, frame.timestamp, cacheKey)
      }))
      
      // Allow browser to breathe
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Report progress
      if (this.onProgress) {
        const progress = ((i + batch.length) / frames.length) * 100
        this.onProgress(progress)
      }
    }
  }
  
  /**
   * Finish encoding and return the final video blob
   */
  async finish(): Promise<Blob> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized')
    }
    
    // Flush encoder
    await this.encoder.flush()
    
    // Close encoder
    this.encoder.close()
    
    let finalBlob: Blob
    
    if (this.mp4File) {
      // Finalize MP4
      this.mp4File.flush()
      
      // Combine all chunks
      const totalSize = this.muxedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Uint8Array(totalSize)
      let offset = 0
      
      for (const chunk of this.muxedChunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      
      finalBlob = new Blob([combined], { type: 'video/mp4' })
    } else if (this.webmMuxer) {
      // Finalize WebM
      await this.webmMuxer.finalize()
      
      // Combine all chunks
      const totalSize = this.muxedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Uint8Array(totalSize)
      let offset = 0
      
      for (const chunk of this.muxedChunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      
      finalBlob = new Blob([combined], { type: 'video/webm' })
    } else {
      throw new Error('No muxer initialized')
    }
    
    logger.info(`Encoding complete: ${this.frameCount} frames, ${finalBlob.size} bytes`)
    
    // Clear frame cache
    this.frameCache.forEach(bitmap => bitmap.close())
    this.frameCache.clear()
    
    return finalBlob
  }
  
  /**
   * Reset the encoder
   */
  reset(): void {
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close()
    }
    
    // Clear frame cache
    this.frameCache.forEach(bitmap => bitmap.close())
    this.frameCache.clear()
    
    this.encoder = null
    this.frameCount = 0
    this.encoderConfig = null
    this.isEncoding = false
    this.mp4File = null
    this.webmMuxer = null
    this.muxedChunks = []
  }
}

// Export check function for compatibility
export async function checkWebCodecsSupport(): Promise<{
  supported: boolean
  codecs: string[]
}> {
  if (!WebCodecsEncoder.isSupported()) {
    return { supported: false, codecs: [] }
  }
  
  const supportedCodecs: string[] = []
  const testCodecs = [
    'avc1.42001E',
    'avc1.4D401E', 
    'vp09.00.10.08',
    'vp8',
    'av01.0.00M.08'
  ]
  
  for (const codec of testCodecs) {
    const config = {
      codec,
      width: 1920,
      height: 1080,
      bitrate: 5000000,
      framerate: 30
    }
    
    try {
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        supportedCodecs.push(codec)
      }
    } catch (e) {
      // Codec not supported
    }
  }
  
  return {
    supported: supportedCodecs.length > 0,
    codecs: supportedCodecs
  }
}