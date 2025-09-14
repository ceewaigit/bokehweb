/**
 * WebGL2 Effects Renderer
 * GPU-accelerated effects processing for maximum performance
 */

import { logger } from '@/lib/utils/logger'
import type { Effect } from '@/types'
import { EffectType } from '@/types'

export class WebGLEffectsRenderer {
  private gl: WebGL2RenderingContext | null = null
  private canvas: HTMLCanvasElement | OffscreenCanvas
  private programs = new Map<string, WebGLProgram>()
  private textures = new Map<string, WebGLTexture>()
  private framebuffers = new Map<string, WebGLFramebuffer>()
  private width: number
  private height: number
  private initialized = false

  // Shader sources
  private readonly vertexShaderSource = `#version 300 es
    precision highp float;
    
    in vec2 a_position;
    in vec2 a_texCoord;
    
    out vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `

  private readonly passthroughFragmentShader = `#version 300 es
    precision highp float;
    
    uniform sampler2D u_texture;
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    void main() {
      fragColor = texture(u_texture, v_texCoord);
    }
  `

  private readonly zoomFragmentShader = `#version 300 es
    precision highp float;
    
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_scale;
    uniform vec2 u_center;
    uniform float u_smoothness;
    
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    void main() {
      vec2 centerOffset = v_texCoord - u_center;
      vec2 scaledCoord = u_center + centerOffset / u_scale;
      
      // Smooth edges with bilinear filtering
      if (scaledCoord.x < 0.0 || scaledCoord.x > 1.0 || 
          scaledCoord.y < 0.0 || scaledCoord.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      } else {
        fragColor = texture(u_texture, scaledCoord);
      }
    }
  `

  private readonly blurFragmentShader = `#version 300 es
    precision highp float;
    
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_radius;
    uniform vec2 u_direction;
    
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    void main() {
      vec2 texelSize = 1.0 / u_resolution;
      vec4 color = vec4(0.0);
      float total = 0.0;
      
      // Gaussian blur with dynamic kernel
      for (float i = -u_radius; i <= u_radius; i += 1.0) {
        float weight = exp(-0.5 * pow(i / (u_radius * 0.5), 2.0));
        vec2 offset = i * texelSize * u_direction;
        color += texture(u_texture, v_texCoord + offset) * weight;
        total += weight;
      }
      
      fragColor = color / total;
    }
  `

  private readonly cursorFragmentShader = `#version 300 es
    precision highp float;
    
    uniform sampler2D u_texture;
    uniform sampler2D u_cursorTexture;
    uniform vec2 u_cursorPos;
    uniform float u_cursorScale;
    uniform float u_cursorOpacity;
    uniform float u_clickRadius;
    uniform float u_clickOpacity;
    
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    void main() {
      vec4 baseColor = texture(u_texture, v_texCoord);
      
      // Add cursor overlay
      vec2 cursorTexCoord = (v_texCoord - u_cursorPos) / u_cursorScale + vec2(0.5);
      if (cursorTexCoord.x >= 0.0 && cursorTexCoord.x <= 1.0 &&
          cursorTexCoord.y >= 0.0 && cursorTexCoord.y <= 1.0) {
        vec4 cursorColor = texture(u_cursorTexture, cursorTexCoord);
        baseColor = mix(baseColor, cursorColor, cursorColor.a * u_cursorOpacity);
      }
      
      // Add click ripple effect
      if (u_clickRadius > 0.0) {
        float dist = distance(v_texCoord, u_cursorPos);
        if (dist < u_clickRadius && dist > u_clickRadius - 0.002) {
          float rippleAlpha = (1.0 - dist / u_clickRadius) * u_clickOpacity;
          baseColor = mix(baseColor, vec4(1.0, 1.0, 1.0, 1.0), rippleAlpha);
        }
      }
      
      fragColor = baseColor;
    }
  `

  constructor(width: number, height: number) {
    this.width = width
    this.height = height

    // Create canvas
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height)
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  /**
   * Initialize WebGL2 context and resources
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    try {
      // Get WebGL2 context
      this.gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        desynchronized: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        stencil: false
      }) as WebGL2RenderingContext

      if (!this.gl) {
        logger.error('WebGL2 not supported')
        return false
      }

      // Setup viewport
      this.gl.viewport(0, 0, this.width, this.height)

      // Create shader programs
      this.createProgram('passthrough', this.vertexShaderSource, this.passthroughFragmentShader)
      this.createProgram('zoom', this.vertexShaderSource, this.zoomFragmentShader)
      this.createProgram('blur', this.vertexShaderSource, this.blurFragmentShader)
      this.createProgram('cursor', this.vertexShaderSource, this.cursorFragmentShader)

      // Create vertex buffer for full-screen quad
      this.setupQuadBuffer()

      // Create textures for ping-pong rendering
      this.createTexture('source')
      this.createTexture('temp')
      this.createFramebuffer('temp')

      this.initialized = true
      logger.info('WebGL2 effects renderer initialized')
      return true
    } catch (error) {
      logger.error('Failed to initialize WebGL2:', error)
      return false
    }
  }

  /**
   * Create shader program
   */
  private createProgram(name: string, vertexSource: string, fragmentSource: string): void {
    if (!this.gl) return

    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource)

    if (!vertexShader || !fragmentShader) {
      throw new Error(`Failed to compile shaders for program: ${name}`)
    }

    const program = this.gl.createProgram()
    if (!program) {
      throw new Error(`Failed to create program: ${name}`)
    }

    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program)
      throw new Error(`Failed to link program ${name}: ${info}`)
    }

    this.programs.set(name, program)
  }

  /**
   * Compile shader
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null

    const shader = this.gl.createShader(type)
    if (!shader) return null

    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader)
      logger.error(`Shader compilation failed: ${info}`)
      this.gl.deleteShader(shader)
      return null
    }

    return shader
  }

  /**
   * Setup vertex buffer for full-screen quad
   */
  private setupQuadBuffer(): void {
    if (!this.gl) return

    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1
    ])

    const texCoords = new Float32Array([
      0, 1,  1, 1,  0, 0,
      0, 0,  1, 1,  1, 0
    ])

    // Position buffer
    const posBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW)

    // Texture coordinate buffer
    const texBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW)
  }

  /**
   * Create texture
   */
  private createTexture(name: string): WebGLTexture | null {
    if (!this.gl) return null

    const texture = this.gl.createTexture()
    if (!texture) return null

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.width, this.height, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    )

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)

    this.textures.set(name, texture)
    return texture
  }

  /**
   * Create framebuffer
   */
  private createFramebuffer(name: string): WebGLFramebuffer | null {
    if (!this.gl) return null

    const framebuffer = this.gl.createFramebuffer()
    if (!framebuffer) return null

    const texture = this.textures.get(name)
    if (!texture) return null

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer)
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      texture,
      0
    )

    this.framebuffers.set(name, framebuffer)
    return framebuffer
  }

  /**
   * Process frame with effects using GPU
   */
  async processFrame(
    source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement,
    effects: Effect[],
    timestamp: number
  ): Promise<ImageBitmap> {
    if (!this.initialized || !this.gl) {
      throw new Error('WebGL renderer not initialized')
    }

    // Upload source to texture
    const sourceTexture = this.textures.get('source')
    if (!sourceTexture) throw new Error('Source texture not found')

    this.gl.bindTexture(this.gl.TEXTURE_2D, sourceTexture)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, source as TexImageSource
    )

    // Apply effects in sequence
    let currentTexture = sourceTexture
    const activeEffects = effects.filter(e => 
      e.enabled && timestamp >= e.startTime && timestamp <= e.endTime
    )

    for (const effect of activeEffects) {
      currentTexture = this.applyEffect(effect, currentTexture, timestamp)
    }

    // Read result to bitmap
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    const pixels = new Uint8Array(this.width * this.height * 4)
    this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)

    // Create ImageData and convert to ImageBitmap
    const imageData = new ImageData(new Uint8ClampedArray(pixels), this.width, this.height)
    return createImageBitmap(imageData)
  }

  /**
   * Apply single effect
   */
  private applyEffect(effect: Effect, inputTexture: WebGLTexture, timestamp: number): WebGLTexture {
    if (!this.gl) return inputTexture

    switch (effect.type) {
      case EffectType.Zoom:
        return this.applyZoomEffect(effect, inputTexture, timestamp)
      case EffectType.Cursor:
        return this.applyCursorEffect(effect, inputTexture, timestamp)
      default:
        return inputTexture
    }
  }

  /**
   * Apply zoom effect
   */
  private applyZoomEffect(effect: Effect, inputTexture: WebGLTexture, timestamp: number): WebGLTexture {
    if (!this.gl) return inputTexture

    const program = this.programs.get('zoom')
    if (!program) return inputTexture

    const data = effect.data as any
    const progress = (timestamp - effect.startTime) / (effect.endTime - effect.startTime)
    const scale = 1 + (data.scale - 1) * progress

    // Render to temp framebuffer
    const tempFramebuffer = this.framebuffers.get('temp')
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tempFramebuffer || null)
    this.gl.useProgram(program)

    // Set uniforms
    this.gl.uniform1i(this.gl.getUniformLocation(program, 'u_texture'), 0)
    this.gl.uniform2f(this.gl.getUniformLocation(program, 'u_resolution'), this.width, this.height)
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'u_scale'), scale)
    this.gl.uniform2f(this.gl.getUniformLocation(program, 'u_center'), data.targetX || 0.5, data.targetY || 0.5)
    this.gl.uniform1f(this.gl.getUniformLocation(program, 'u_smoothness'), 1.0)

    // Bind input texture
    this.gl.activeTexture(this.gl.TEXTURE0)
    this.gl.bindTexture(this.gl.TEXTURE_2D, inputTexture)

    // Draw
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6)

    return this.textures.get('temp')!
  }

  /**
   * Apply cursor effect
   */
  private applyCursorEffect(effect: Effect, inputTexture: WebGLTexture, timestamp: number): WebGLTexture {
    // Simplified - would need cursor texture and position data
    return inputTexture
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.gl) {
      // Delete programs
      for (const program of this.programs.values()) {
        this.gl.deleteProgram(program)
      }

      // Delete textures
      for (const texture of this.textures.values()) {
        this.gl.deleteTexture(texture)
      }

      // Delete framebuffers
      for (const framebuffer of this.framebuffers.values()) {
        this.gl.deleteFramebuffer(framebuffer)
      }

      // Lose context
      const loseContext = this.gl.getExtension('WEBGL_lose_context')
      if (loseContext) {
        loseContext.loseContext()
      }
    }

    this.initialized = false
    logger.info('WebGL renderer disposed')
  }
}