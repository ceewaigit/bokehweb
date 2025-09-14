/**
 * Frame Processing Worker
 * Handles effects processing in parallel using OffscreenCanvas
 */

import type { Effect } from '@/types'
import { EffectType } from '@/types'

interface ProcessFrameMessage {
  type: 'process'
  frameId: string
  bitmap: ImageBitmap | any // Can be video element or bitmap
  effects: Effect[]
  width: number
  height: number
  timestamp: number
  metadata?: any
}

interface InitMessage {
  type: 'init'
  width: number
  height: number
}

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

// Initialize worker canvas
function initialize(width: number, height: number) {
  canvas = new OffscreenCanvas(width, height)
  ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false
  }) as OffscreenCanvasRenderingContext2D
}

// Process a single frame with effects
async function processFrame(
  source: ImageBitmap | any,
  effects: Effect[],
  timestamp: number,
  metadata?: any
): Promise<ImageBitmap> {
  if (!ctx || !canvas) {
    throw new Error('Worker not initialized')
  }

  // Handle video element or ImageBitmap
  let bitmap: ImageBitmap
  if (source instanceof ImageBitmap) {
    bitmap = source
  } else {
    // For video elements or other sources, we can't create bitmap in worker
    // Just draw directly (this will be a canvas from main thread)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    try {
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    } catch (e) {
      // If we can't draw it, return a black frame
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    return canvas.transferToImageBitmap()
  }

  // Clear and draw base frame
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  // Apply effects
  const activeEffects = effects.filter(e => 
    e.enabled && timestamp >= e.startTime && timestamp <= e.endTime
  )

  if (activeEffects.length > 0) {
    // Apply zoom effect
    const zoomEffect = activeEffects.find(e => e.type === EffectType.Zoom)
    if (zoomEffect && zoomEffect.data) {
      const data = zoomEffect.data as any
      const progress = (timestamp - zoomEffect.startTime) / (zoomEffect.endTime - zoomEffect.startTime)
      
      // Simple zoom implementation (will be replaced with WebGL)
      const scale = 1 + (data.scale - 1) * progress
      if (scale !== 1) {
        const tempCanvas = new OffscreenCanvas(canvas.width, canvas.height)
        const tempCtx = tempCanvas.getContext('2d')!
        tempCtx.drawImage(canvas, 0, 0)
        
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.save()
        const centerX = canvas.width * (data.targetX || 0.5)
        const centerY = canvas.height * (data.targetY || 0.5)
        ctx.translate(centerX, centerY)
        ctx.scale(scale, scale)
        ctx.translate(-centerX, -centerY)
        ctx.drawImage(tempCanvas, 0, 0)
        ctx.restore()
      }
    }

    // Apply cursor effect
    const cursorEffect = activeEffects.find(e => e.type === EffectType.Cursor)
    if (cursorEffect && metadata?.mouseEvents) {
      // Simplified cursor rendering
      const cursorData = cursorEffect.data as any
      if (cursorData.visible) {
        const event = metadata.mouseEvents.find((e: any) => 
          Math.abs(e.timestamp - timestamp) < 50
        )
        if (event) {
          ctx.save()
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 2
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
          ctx.shadowBlur = 4
          ctx.shadowOffsetX = 1
          ctx.shadowOffsetY = 2
          
          // Draw simple cursor
          ctx.beginPath()
          ctx.moveTo(event.x, event.y)
          ctx.lineTo(event.x + 12, event.y + 12)
          ctx.lineTo(event.x + 5, event.y + 12)
          ctx.lineTo(event.x, event.y + 17)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        }
      }
    }
  }

  // Return processed frame as ImageBitmap
  return canvas.transferToImageBitmap()
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const message = event.data

  try {
    switch (message.type) {
      case 'init': {
        const { width, height } = message as InitMessage
        initialize(width, height)
        self.postMessage({ type: 'initialized' })
        break
      }

      case 'process': {
        const { frameId, bitmap, effects, timestamp, metadata } = message as ProcessFrameMessage
        const processedBitmap = await processFrame(bitmap, effects, timestamp, metadata)
        
        self.postMessage({
          type: 'processed',
          frameId,
          bitmap: processedBitmap,
          timestamp
        }, { transfer: [processedBitmap] })
        break
      }

      case 'terminate': {
        self.close()
        break
      }

      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      frameId: message.frameId
    })
  }
}

export {}