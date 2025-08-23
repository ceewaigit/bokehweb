// Timeline Effects Data Structures

export interface RecordingEnhancementSettings {
  // Auto Zoom Settings
  enableAutoZoom: boolean
  zoomSensitivity: number // 0.1 - 2.0
  maxZoom: number // 1.0 - 4.0
  zoomSpeed: number // 0.1 - 2.0

  // Mouse Effects
  showCursor: boolean
  cursorSize: number // 0.5 - 8.0 multiplier
  cursorColor: string
  showClickEffects: boolean
  clickEffectSize: number // 0.5 - 2.0 multiplier
  clickEffectColor: string
  showCursorHighlight: boolean
  highlightColor: string

  // Motion Detection
  motionSensitivity: number // 0.1 - 2.0
  enableSmartPanning: boolean
  panSpeed: number // 0.1 - 2.0

  // Visual Enhancements
  enableSmoothAnimations: boolean
  animationQuality: 'performance' | 'balanced' | 'quality'
  showKeystrokes: boolean
  keystrokePosition: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
}


