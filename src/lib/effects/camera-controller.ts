/**
 * Intelligent Camera Controller
 * Implements Screen Studio-style viewport following with dead zones and directional bias
 */

interface Vec2 {
  x: number
  y: number
}

interface CameraState {
  position: Vec2
  targetPosition: Vec2
  velocity: Vec2
  scale: number
}

interface MouseState {
  position: Vec2
  velocity: Vec2
  acceleration: Vec2
  history: Array<{ position: Vec2; timestamp: number }>
}

export interface CameraConfig {
  deadZoneSize: number // 0.0 to 1.0, percentage of viewport
  responsiveness: number // 0.0 to 1.0, how quickly camera responds
  smoothingFactor: number // 0.0 to 1.0, motion smoothing
  predictiveStrength: number // 0.0 to 1.0, lookahead amount
  directionalBias: number // 0.0 to 1.0, preference for single-axis movement
  edgeResistance: number // 0.0 to 1.0, resistance at viewport edges
  minMovementThreshold: number // pixels, minimum movement to trigger camera
}

export class CameraController {
  private camera: CameraState = {
    position: { x: 0.5, y: 0.5 },
    targetPosition: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    scale: 1.0
  }

  private mouse: MouseState = {
    position: { x: 0.5, y: 0.5 },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    history: []
  }

  private config: CameraConfig = {
    deadZoneSize: 0.3, // 30% dead zone from center
    responsiveness: 0.15, // Smooth camera movement
    smoothingFactor: 0.85, // High smoothing for professional feel
    predictiveStrength: 0.2, // Subtle lookahead
    directionalBias: 0.7, // Prefer single-axis movement
    edgeResistance: 0.8, // Strong resistance at edges
    minMovementThreshold: 5 // 5 pixel minimum movement
  }

  private lastUpdateTime: number = 0
  private debugMode: boolean = true

  constructor(config?: Partial<CameraConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * Update mouse position and calculate velocity/acceleration
   */
  private updateMousePosition(x: number, y: number, timestamp: number) {
    const newPosition = { x, y }
    
    // Add to history
    this.mouse.history.push({ position: newPosition, timestamp })
    
    // Keep only last 10 frames
    if (this.mouse.history.length > 10) {
      this.mouse.history.shift()
    }

    // Calculate velocity if we have history
    if (this.mouse.history.length >= 2) {
      const prev = this.mouse.history[this.mouse.history.length - 2]
      const dt = (timestamp - prev.timestamp) / 1000 // Convert to seconds
      
      if (dt > 0) {
        const newVelocity = {
          x: (newPosition.x - prev.position.x) / dt,
          y: (newPosition.y - prev.position.y) / dt
        }

        // Calculate acceleration
        this.mouse.acceleration = {
          x: (newVelocity.x - this.mouse.velocity.x) / dt,
          y: (newVelocity.y - this.mouse.velocity.y) / dt
        }

        // Smooth velocity with exponential moving average
        const smoothing = this.config.smoothingFactor
        this.mouse.velocity = {
          x: this.mouse.velocity.x * smoothing + newVelocity.x * (1 - smoothing),
          y: this.mouse.velocity.y * smoothing + newVelocity.y * (1 - smoothing)
        }
      }
    }

    this.mouse.position = newPosition
  }

  /**
   * Get camera position for a given zoom state and timestamp
   */
  getCameraPosition(
    mouseX: number,
    mouseY: number,
    scale: number,
    timestamp: number,
    isIntro: boolean = false,
    isOutro: boolean = false
  ): Vec2 {
    // Update mouse tracking
    this.updateMousePosition(mouseX, mouseY, timestamp)
    
    // Update camera scale
    this.camera.scale = scale

    // During intro/outro, use simpler logic
    if (isIntro || isOutro) {
      return { x: mouseX, y: mouseY }
    }

    // Calculate viewport size based on zoom
    const viewportSize = 1.0 / scale
    const halfViewport = viewportSize / 2

    // Calculate dead zone boundaries (in normalized coordinates)
    const deadZoneWidth = viewportSize * this.config.deadZoneSize
    const deadZoneHeight = viewportSize * this.config.deadZoneSize

    // Dead zone bounds (centered in viewport)
    const deadZoneLeft = this.camera.position.x - deadZoneWidth / 2
    const deadZoneRight = this.camera.position.x + deadZoneWidth / 2
    const deadZoneTop = this.camera.position.y - deadZoneHeight / 2
    const deadZoneBottom = this.camera.position.y + deadZoneHeight / 2

    // Check if mouse is outside dead zone
    const mouseOutsideDeadZone = 
      mouseX < deadZoneLeft || mouseX > deadZoneRight ||
      mouseY < deadZoneTop || mouseY > deadZoneBottom

    if (mouseOutsideDeadZone) {
      // Calculate how far outside the dead zone
      let deltaX = 0
      let deltaY = 0

      if (mouseX < deadZoneLeft) {
        deltaX = mouseX - deadZoneLeft
      } else if (mouseX > deadZoneRight) {
        deltaX = mouseX - deadZoneRight
      }

      if (mouseY < deadZoneTop) {
        deltaY = mouseY - deadZoneTop
      } else if (mouseY > deadZoneBottom) {
        deltaY = mouseY - deadZoneBottom
      }

      // Apply directional bias - prefer single-axis movement
      const bias = this.config.directionalBias
      if (Math.abs(deltaX) > Math.abs(deltaY) * bias) {
        // Horizontal movement dominant
        deltaY *= (1 - bias)
      } else if (Math.abs(deltaY) > Math.abs(deltaX) * bias) {
        // Vertical movement dominant
        deltaX *= (1 - bias)
      }

      // Add predictive offset based on mouse velocity
      const predictiveX = this.mouse.velocity.x * this.config.predictiveStrength * 0.001
      const predictiveY = this.mouse.velocity.y * this.config.predictiveStrength * 0.001

      // Calculate target position
      this.camera.targetPosition = {
        x: this.camera.position.x + deltaX + predictiveX,
        y: this.camera.position.y + deltaY + predictiveY
      }

      // Apply edge resistance
      const edgeThreshold = 0.1 // Start resisting 10% from edge
      if (this.camera.targetPosition.x - halfViewport < 0) {
        const overshoot = -(this.camera.targetPosition.x - halfViewport)
        this.camera.targetPosition.x += overshoot * this.config.edgeResistance
      } else if (this.camera.targetPosition.x + halfViewport > 1) {
        const overshoot = (this.camera.targetPosition.x + halfViewport) - 1
        this.camera.targetPosition.x -= overshoot * this.config.edgeResistance
      }

      if (this.camera.targetPosition.y - halfViewport < 0) {
        const overshoot = -(this.camera.targetPosition.y - halfViewport)
        this.camera.targetPosition.y += overshoot * this.config.edgeResistance
      } else if (this.camera.targetPosition.y + halfViewport > 1) {
        const overshoot = (this.camera.targetPosition.y + halfViewport) - 1
        this.camera.targetPosition.y -= overshoot * this.config.edgeResistance
      }
    }

    // Smooth camera movement towards target
    const dt = this.lastUpdateTime > 0 ? (timestamp - this.lastUpdateTime) / 1000 : 0.016
    this.lastUpdateTime = timestamp

    const responsiveness = this.config.responsiveness
    const smoothingFactor = 1 - Math.exp(-responsiveness * dt * 60) // Frame-rate independent

    // Update camera position with smoothing
    this.camera.position = {
      x: this.camera.position.x + (this.camera.targetPosition.x - this.camera.position.x) * smoothingFactor,
      y: this.camera.position.y + (this.camera.targetPosition.y - this.camera.position.y) * smoothingFactor
    }

    // Debug logging
    if (this.debugMode && timestamp % 500 < 50) {
      console.log(`📷 SMART CAMERA at ${(timestamp / 1000).toFixed(2)}s:`, {
        mouse: `(${mouseX.toFixed(3)}, ${mouseY.toFixed(3)})`,
        camera: `(${this.camera.position.x.toFixed(3)}, ${this.camera.position.y.toFixed(3)})`,
        target: `(${this.camera.targetPosition.x.toFixed(3)}, ${this.camera.targetPosition.y.toFixed(3)})`,
        velocity: `(${this.mouse.velocity.x.toFixed(1)}, ${this.mouse.velocity.y.toFixed(1)})`,
        inDeadZone: !mouseOutsideDeadZone,
        scale: scale.toFixed(2)
      })
    }

    return this.camera.position
  }

  /**
   * Get dead zone visualization data for debugging
   */
  getDeadZoneVisualization(canvasWidth: number, canvasHeight: number): {
    x: number
    y: number
    width: number
    height: number
  } | null {
    if (!this.debugMode || this.camera.scale <= 1.0) {
      return null
    }

    const viewportSize = 1.0 / this.camera.scale
    const deadZoneWidth = viewportSize * this.config.deadZoneSize
    const deadZoneHeight = viewportSize * this.config.deadZoneSize

    // Convert normalized coordinates to canvas pixels
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    
    return {
      x: centerX - (deadZoneWidth * canvasWidth) / 2,
      y: centerY - (deadZoneHeight * canvasHeight) / 2,
      width: deadZoneWidth * canvasWidth,
      height: deadZoneHeight * canvasHeight
    }
  }

  /**
   * Get current camera position
   */
  getPosition(): { x: number; y: number } {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y
    }
  }

  /**
   * Set camera position directly
   */
  setPosition(x: number, y: number): void {
    this.camera.position.x = x
    this.camera.position.y = y
    this.camera.targetPosition.x = x
    this.camera.targetPosition.y = y
  }

  /**
   * Reset camera to center
   */
  reset() {
    this.camera = {
      position: { x: 0.5, y: 0.5 },
      targetPosition: { x: 0.5, y: 0.5 },
      velocity: { x: 0, y: 0 },
      scale: 1.0
    }
    this.mouse = {
      position: { x: 0.5, y: 0.5 },
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      history: []
    }
    this.lastUpdateTime = 0
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CameraConfig>) {
    this.config = { ...this.config, ...config }
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean) {
    this.debugMode = enabled
  }

  /**
   * Get current camera state (for debugging)
   */
  getCameraState(): CameraState {
    return { ...this.camera }
  }

  /**
   * Get current mouse state (for debugging)
   */
  getMouseState(): MouseState {
    return {
      position: { ...this.mouse.position },
      velocity: { ...this.mouse.velocity },
      acceleration: { ...this.mouse.acceleration },
      history: this.mouse.history.map(h => ({ 
        position: { ...h.position }, 
        timestamp: h.timestamp 
      }))
    }
  }
}