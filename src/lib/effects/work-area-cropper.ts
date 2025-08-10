/**
 * Work Area Cropper - Crops video to exclude dock/taskbar area
 * Ensures the dock remains visible during recording but is excluded from the final video
 */

import { logger } from '@/lib/utils/logger'

export interface WorkAreaCropperOptions {
  captureArea?: {
    fullBounds: { x: number; y: number; width: number; height: number }
    workArea: { x: number; y: number; width: number; height: number }
    scaleFactor: number
  }
}

export class WorkAreaCropper {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private options: WorkAreaCropperOptions

  constructor(options: WorkAreaCropperOptions = {}) {
    this.options = options
    logger.debug('WorkAreaCropper initialized', options)
  }

  /**
   * Initialize the cropper with a canvas
   */
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    })

    if (!this.ctx) {
      throw new Error('Failed to get 2D context')
    }

    // Set up canvas for work area dimensions if available
    if (this.options.captureArea) {
      const { workArea, scaleFactor } = this.options.captureArea
      canvas.width = workArea.width * scaleFactor
      canvas.height = workArea.height * scaleFactor
      logger.debug('Canvas sized for work area', {
        width: canvas.width,
        height: canvas.height
      })
    }
  }

  /**
   * Apply crop to video frame
   */
  cropFrame(
    video: HTMLVideoElement,
    canvas?: HTMLCanvasElement
  ): void {
    const targetCanvas = canvas || this.canvas
    const ctx = canvas ? canvas.getContext('2d') : this.ctx

    if (!targetCanvas || !ctx || !this.options.captureArea) {
      // No cropping needed, just draw the full frame
      if (targetCanvas && ctx) {
        targetCanvas.width = video.videoWidth
        targetCanvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
      }
      return
    }

    const { fullBounds, workArea, scaleFactor } = this.options.captureArea

    // Calculate crop offsets (dock can be on any side)
    const cropX = (workArea.x - fullBounds.x) * scaleFactor
    const cropY = (workArea.y - fullBounds.y) * scaleFactor
    const cropWidth = workArea.width * scaleFactor
    const cropHeight = workArea.height * scaleFactor

    // Set canvas to work area size
    targetCanvas.width = cropWidth
    targetCanvas.height = cropHeight

    // Draw only the work area portion of the video
    ctx.drawImage(
      video,
      cropX, cropY, cropWidth, cropHeight,  // Source rectangle (work area)
      0, 0, cropWidth, cropHeight           // Destination rectangle (full canvas)
    )

    logger.debug('Frame cropped', {
      source: { x: cropX, y: cropY, w: cropWidth, h: cropHeight },
      dest: { w: targetCanvas.width, h: targetCanvas.height }
    })
  }

  /**
   * Get the crop dimensions for external use
   */
  getCropDimensions(): {
    x: number
    y: number
    width: number
    height: number
  } | null {
    if (!this.options.captureArea) {
      return null
    }

    const { fullBounds, workArea, scaleFactor } = this.options.captureArea

    return {
      x: (workArea.x - fullBounds.x) * scaleFactor,
      y: (workArea.y - fullBounds.y) * scaleFactor,
      width: workArea.width * scaleFactor,
      height: workArea.height * scaleFactor
    }
  }

  /**
   * Check if cropping is needed
   */
  needsCropping(): boolean {
    if (!this.options.captureArea) {
      return false
    }

    const { fullBounds, workArea } = this.options.captureArea

    // Check if work area is different from full bounds
    return (
      workArea.x !== fullBounds.x ||
      workArea.y !== fullBounds.y ||
      workArea.width !== fullBounds.width ||
      workArea.height !== fullBounds.height
    )
  }

  /**
   * Update capture area (for when recording settings change)
   */
  updateCaptureArea(captureArea: WorkAreaCropperOptions['captureArea']): void {
    this.options.captureArea = captureArea

    // Resize canvas if initialized
    if (this.canvas && captureArea) {
      const { workArea, scaleFactor } = captureArea
      this.canvas.width = workArea.width * scaleFactor
      this.canvas.height = workArea.height * scaleFactor
    }

    logger.debug('Capture area updated', captureArea)
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.canvas = null
    this.ctx = null
    logger.debug('WorkAreaCropper disposed')
  }
}