/**
 * Export type definitions
 */

import type { ExportFormat, QualityLevel } from './project'

// Export performance mode for memory optimization
export enum ExportMode {
  Draft = 'draft',     // Fast, low memory, reduced quality
  Preview = 'preview', // Balanced performance and quality
  Final = 'final'      // Highest quality, more memory usage
}

export interface ExportSettings {
  format: ExportFormat
  quality: QualityLevel
  resolution: {
    width: number
    height: number
  }
  framerate: number
  outputPath?: string
  
  // Performance mode
  mode?: ExportMode
  
  // Advanced settings
  bitrate?: number
  codec?: string
  keyframeInterval?: number
  
  // Effect settings
  includeEffects?: boolean
  includeCursor?: boolean
  includeKeystrokes?: boolean
  includeAnnotations?: boolean
  
  // Performance settings
  useHardwareAcceleration?: boolean
  maxWorkers?: number
  segmentDuration?: number
  
  // Memory optimization settings
  maxMemoryMB?: number
  disableVideoCache?: boolean
  chunkSize?: number
}