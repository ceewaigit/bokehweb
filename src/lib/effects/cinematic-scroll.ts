import { ScrollEvent } from '@/types/project'

export interface CinematicScrollState {
  position: { x: number; y: number }
  velocity: { x: number; y: number }
  momentum: { x: number; y: number }
  tilt: { x: number; y: number }
  scale: number
  blur: number
}

export interface CinematicScrollConfig {
  preset: 'subtle' | 'medium' | 'dramatic'
  damping?: number
  tension?: number
  maxVelocity?: number
  parallaxDepth?: number
  tiltIntensity?: number
  blurIntensity?: number
  elasticBounds?: boolean
}

const PRESET_CONFIGS: Record<string, Partial<CinematicScrollConfig>> = {
  subtle: {
    damping: 0.95,
    tension: 0.1,
    maxVelocity: 5,
    parallaxDepth: 0.1,
    tiltIntensity: 2,
    blurIntensity: 0,
    elasticBounds: true
  },
  medium: {
    damping: 0.9,
    tension: 0.15,
    maxVelocity: 10,
    parallaxDepth: 0.2,
    tiltIntensity: 5,
    blurIntensity: 0.5,
    elasticBounds: true
  },
  dramatic: {
    damping: 0.85,
    tension: 0.2,
    maxVelocity: 20,
    parallaxDepth: 0.3,
    tiltIntensity: 10,
    blurIntensity: 1,
    elasticBounds: true
  }
}

export class CinematicScrollCalculator {
  private state: CinematicScrollState = {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    momentum: { x: 0, y: 0 },
    tilt: { x: 0, y: 0 },
    scale: 1,
    blur: 0
  }

  private config: Required<CinematicScrollConfig>
  private lastTimestamp = 0
  private scrollHistory: Array<{ timestamp: number; delta: { x: number; y: number } }> = []

  constructor(config: CinematicScrollConfig) {
    const presetConfig = PRESET_CONFIGS[config.preset] || PRESET_CONFIGS.medium
    this.config = {
      preset: config.preset,
      damping: config.damping ?? presetConfig.damping ?? 0.9,
      tension: config.tension ?? presetConfig.tension ?? 0.15,
      maxVelocity: config.maxVelocity ?? presetConfig.maxVelocity ?? 10,
      parallaxDepth: config.parallaxDepth ?? presetConfig.parallaxDepth ?? 0.2,
      tiltIntensity: config.tiltIntensity ?? presetConfig.tiltIntensity ?? 5,
      blurIntensity: config.blurIntensity ?? presetConfig.blurIntensity ?? 0.5,
      elasticBounds: config.elasticBounds ?? presetConfig.elasticBounds ?? true
    }
  }

  update(scrollEvents: ScrollEvent[], currentTimeMs: number): CinematicScrollState {
    // Clean old history entries (keep last 500ms)
    this.scrollHistory = this.scrollHistory.filter(h => currentTimeMs - h.timestamp < 500)

    // Process new scroll events
    const newEvents = scrollEvents.filter(e => e.timestamp > this.lastTimestamp && e.timestamp <= currentTimeMs)

    for (const event of newEvents) {
      this.scrollHistory.push({
        timestamp: event.timestamp,
        delta: { x: event.deltaX, y: event.deltaY }
      })
    }

    if (newEvents.length > 0) {
      this.lastTimestamp = newEvents[newEvents.length - 1].timestamp
    }

    // Calculate velocity from recent scroll history
    const recentHistory = this.scrollHistory.filter(h => currentTimeMs - h.timestamp < 100)
    if (recentHistory.length > 0) {
      const totalDelta = recentHistory.reduce(
        (acc, h) => ({ x: acc.x + h.delta.x, y: acc.y + h.delta.y }),
        { x: 0, y: 0 }
      )
      const timeSpan = Math.max(1, currentTimeMs - recentHistory[0].timestamp)

      // Update velocity with smoothing
      const newVelX = (totalDelta.x / timeSpan) * 10
      const newVelY = (totalDelta.y / timeSpan) * 10

      this.state.velocity.x = this.lerp(this.state.velocity.x, newVelX, 0.3)
      this.state.velocity.y = this.lerp(this.state.velocity.y, newVelY, 0.3)
    } else {
      // Apply damping when no recent scrolling
      this.state.velocity.x *= this.config.damping
      this.state.velocity.y *= this.config.damping
    }

    // Clamp velocity
    this.state.velocity.x = this.clamp(this.state.velocity.x, -this.config.maxVelocity, this.config.maxVelocity)
    this.state.velocity.y = this.clamp(this.state.velocity.y, -this.config.maxVelocity, this.config.maxVelocity)

    // Update momentum (smoother than velocity for visual effects)
    this.state.momentum.x = this.lerp(this.state.momentum.x, this.state.velocity.x, this.config.tension)
    this.state.momentum.y = this.lerp(this.state.momentum.y, this.state.velocity.y, this.config.tension)

    // Update position with momentum
    this.state.position.x += this.state.momentum.x * 0.01
    this.state.position.y += this.state.momentum.y * 0.01

    // Apply elastic bounds
    if (this.config.elasticBounds) {
      const maxOffset = 0.5
      if (Math.abs(this.state.position.y) > maxOffset) {
        const excess = Math.abs(this.state.position.y) - maxOffset
        const elasticForce = -Math.sign(this.state.position.y) * excess * 0.2
        this.state.position.y += elasticForce
        this.state.momentum.y *= 0.8
      }
    }

    // Calculate tilt based on momentum
    const targetTiltX = -this.state.momentum.y * this.config.tiltIntensity * 0.1
    const targetTiltY = this.state.momentum.x * this.config.tiltIntensity * 0.1
    this.state.tilt.x = this.lerp(this.state.tilt.x, targetTiltX, 0.1)
    this.state.tilt.y = this.lerp(this.state.tilt.y, targetTiltY, 0.1)

    // Calculate scale based on velocity magnitude
    const speed = Math.sqrt(this.state.velocity.x ** 2 + this.state.velocity.y ** 2)
    const targetScale = 1 - (speed / this.config.maxVelocity) * 0.05
    this.state.scale = this.lerp(this.state.scale, targetScale, 0.1)

    // Calculate motion blur
    const targetBlur = (speed / this.config.maxVelocity) * this.config.blurIntensity
    this.state.blur = this.lerp(this.state.blur, targetBlur, 0.2)

    // Removed verbose per-frame logging

    return { ...this.state }
  }

  getParallaxLayers(baseState: CinematicScrollState) {
    const depth = this.config.parallaxDepth
    return {
      background: {
        x: baseState.position.x * (1 - depth),
        y: baseState.position.y * (1 - depth),
        scale: 1 + depth * 0.1
      },
      video: {
        x: baseState.position.x,
        y: baseState.position.y,
        scale: baseState.scale
      },
      foreground: {
        x: baseState.position.x * (1 + depth * 0.5),
        y: baseState.position.y * (1 + depth * 0.5),
        scale: 1 - depth * 0.05
      }
    }
  }

  reset() {
    this.state = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      momentum: { x: 0, y: 0 },
      tilt: { x: 0, y: 0 },
      scale: 1,
      blur: 0
    }
    this.scrollHistory = []
    this.lastTimestamp = 0
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }
}

export function createCinematicTransform(state: CinematicScrollState): string {
  const transforms: string[] = []

  if (state.position.x !== 0 || state.position.y !== 0) {
    transforms.push(`translate3d(${state.position.x * 100}px, ${state.position.y * 100}px, 0)`)
  }

  if (state.tilt.x !== 0 || state.tilt.y !== 0) {
    transforms.push(`rotateX(${state.tilt.x}deg) rotateY(${state.tilt.y}deg)`)
  }

  if (state.scale !== 1) {
    transforms.push(`scale(${state.scale})`)
  }

  return transforms.join(' ')
}

export function createBlurFilter(blur: number): string | undefined {
  if (blur <= 0.01) return undefined
  return `blur(${blur * 5}px)`
}