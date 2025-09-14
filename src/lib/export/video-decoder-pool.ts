/**
 * Video Decoder Pool
 * Manages multiple VideoDecoders for parallel video decoding
 */

import { logger } from '@/lib/utils/logger'

interface DecoderInstance {
  id: number
  decoder: VideoDecoder | null
  busy: boolean
  videoUrl?: string
}

export class VideoDecoderPool {
  private decoders: DecoderInstance[] = []
  private poolSize: number
  private width: number
  private height: number
  private frameQueue = new Map<number, VideoFrame[]>()
  
  constructor(width: number, height: number, poolSize: number = 2) {
    this.width = width
    this.height = height
    this.poolSize = Math.min(poolSize, 4) // Limit to 4 decoders
    
    logger.info(`Creating video decoder pool with ${this.poolSize} decoders`)
  }
  
  /**
   * Initialize decoder pool
   */
  async initialize(): Promise<void> {
    if (!VideoDecoderPool.isSupported()) {
      logger.warn('VideoDecoder not supported, falling back to video element')
      return
    }
    
    for (let i = 0; i < this.poolSize; i++) {
      this.decoders.push({
        id: i,
        decoder: null,
        busy: false
      })
    }
  }
  
  /**
   * Check if VideoDecoder is supported
   */
  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined'
  }
  
  /**
   * Get an available decoder
   */
  async acquireDecoder(): Promise<DecoderInstance | null> {
    const available = this.decoders.find(d => !d.busy)
    if (available) {
      available.busy = true
      return available
    }
    return null
  }
  
  /**
   * Release a decoder
   */
  releaseDecoder(decoder: DecoderInstance): void {
    decoder.busy = false
    if (decoder.decoder) {
      decoder.decoder.reset()
    }
  }
  
  /**
   * Decode video chunk
   */
  async decodeChunk(
    decoder: DecoderInstance,
    chunk: EncodedVideoChunk
  ): Promise<VideoFrame | null> {
    if (!decoder.decoder) {
      // Create decoder on demand
      decoder.decoder = new VideoDecoder({
        output: (frame) => {
          if (!this.frameQueue.has(decoder.id)) {
            this.frameQueue.set(decoder.id, [])
          }
          this.frameQueue.get(decoder.id)!.push(frame)
        },
        error: (error) => {
          logger.error(`Decoder ${decoder.id} error:`, error)
        }
      })
      
      // Configure decoder for H.264
      await decoder.decoder.configure({
        codec: 'avc1.42001E',
        codedWidth: this.width,
        codedHeight: this.height,
        hardwareAcceleration: 'prefer-hardware'
      })
    }
    
    // Decode chunk
    decoder.decoder.decode(chunk)
    
    // Wait for frame
    const frames = this.frameQueue.get(decoder.id)
    if (frames && frames.length > 0) {
      return frames.shift()!
    }
    
    return null
  }
  
  /**
   * Cleanup
   */
  dispose(): void {
    for (const decoder of this.decoders) {
      if (decoder.decoder) {
        decoder.decoder.close()
      }
    }
    this.decoders = []
    this.frameQueue.clear()
  }
}