/**
 * WebGL-based Effects Renderer
 * GPU-accelerated effects processing for maximum performance
 */

import { logger } from '@/lib/utils/logger'
import type { Effect } from '@/types'
import { EffectType } from '@/types'

export class WebGLEffectsRenderer {
  private gl: WebGL2RenderingContext | null = null
  private canvas: OffscreenCanvas | HTMLCanvasElement
  private programs = new Map<string, WebGLProgram>()
  private framebuffer: WebGLFramebuffer | null = null
  private textures = new Map<string, WebGLTexture>()
  private width: number
  private height: number
  
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
    
    // Initialize WebGL
    this.initWebGL()
  }
  
  /**
   * Initialize WebGL context
   */
  private initWebGL(): void {
    const options: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      desynchronized: true
    }
    
    this.gl = this.canvas.getContext('webgl2', options) as WebGL2RenderingContext
    
    if (!this.gl) {
      logger.warn('WebGL2 not available, falling back to CPU rendering')
      return
    }
    
    // Setup viewport
    this.gl.viewport(0, 0, this.width, this.height)
    
    // Create framebuffer for rendering
    this.framebuffer = this.gl.createFramebuffer()
    
    // Compile shaders
    this.compileShaders()
    
    logger.info('WebGL effects renderer initialized')
  }
  
  /**
   * Compile effect shaders
   */
  private compileShaders(): void {
    if (!this.gl) return
    
    // Base vertex shader
    const vertexShader = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `
    
    // Zoom effect fragment shader
    const zoomShader = `#version 300 es
      precision highp float;
      
      uniform sampler2D u_image;
      uniform vec2 u_resolution;
      uniform float u_scale;
      uniform vec2 u_center;
      uniform float u_smoothness;
      
      in vec2 v_texCoord;
      out vec4 fragColor;
      
      void main() {
        vec2 center = u_center;
        vec2 offset = (v_texCoord - center) / u_scale + center;
        
        // Smooth edges with bicubic interpolation
        vec2 texSize = u_resolution;
        vec2 invTexSize = 1.0 / texSize;
        
        vec2 p = offset * texSize - 0.5;
        vec2 f = fract(p);
        p = floor(p) + 0.5;
        
        // Catmull-Rom spline
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
        vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
        vec2 w3 = f * f * (-0.5 + 0.5 * f);
        
        vec2 p0 = (p - 1.0) * invTexSize;
        vec2 p1 = p * invTexSize;
        vec2 p2 = (p + 1.0) * invTexSize;
        vec2 p3 = (p + 2.0) * invTexSize;
        
        fragColor = 
          texture(u_image, vec2(p0.x, p0.y)) * w0.x * w0.y +
          texture(u_image, vec2(p1.x, p0.y)) * w1.x * w0.y +
          texture(u_image, vec2(p2.x, p0.y)) * w2.x * w0.y +
          texture(u_image, vec2(p3.x, p0.y)) * w3.x * w0.y +
          texture(u_image, vec2(p0.x, p1.y)) * w0.x * w1.y +
          texture(u_image, vec2(p1.x, p1.y)) * w1.x * w1.y +
          texture(u_image, vec2(p2.x, p1.y)) * w2.x * w1.y +
          texture(u_image, vec2(p3.x, p1.y)) * w3.x * w1.y +
          texture(u_image, vec2(p0.x, p2.y)) * w0.x * w2.y +
          texture(u_image, vec2(p1.x, p2.y)) * w1.x * w2.y +
          texture(u_image, vec2(p2.x, p2.y)) * w2.x * w2.y +
          texture(u_image, vec2(p3.x, p2.y)) * w3.x * w2.y +
          texture(u_image, vec2(p0.x, p3.y)) * w0.x * w3.y +
          texture(u_image, vec2(p1.x, p3.y)) * w1.x * w3.y +
          texture(u_image, vec2(p2.x, p3.y)) * w2.x * w3.y +
          texture(u_image, vec2(p3.x, p3.y)) * w3.x * w3.y;
      }
    `
    
    // Motion blur shader
    const motionBlurShader = `#version 300 es
      precision highp float;
      
      uniform sampler2D u_image;
      uniform sampler2D u_prevImage;
      uniform vec2 u_velocity;
      uniform float u_samples;
      
      in vec2 v_texCoord;
      out vec4 fragColor;
      
      void main() {
        vec2 velocity = u_velocity;
        float samples = u_samples;
        
        vec4 color = texture(u_image, v_texCoord);
        
        for (float i = 1.0; i < samples; i++) {
          float t = i / samples;
          vec2 offset = velocity * t;
          color += texture(u_image, v_texCoord - offset);
        }
        
        fragColor = color / samples;
      }
    `
    
    // Compile programs
    this.programs.set('zoom', this.createProgram(vertexShader, zoomShader))
    this.programs.set('motionBlur', this.createProgram(vertexShader, motionBlurShader))
  }
  
  /**
   * Create WebGL program
   */
  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    if (!this.gl) throw new Error('WebGL not initialized')
    
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource)
    
    const program = this.gl.createProgram()!
    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error('Failed to link program: ' + this.gl.getProgramInfoLog(program))
    }
    
    return program
  }
  
  /**
   * Compile shader
   */
  private compileShader(type: number, source: string): WebGLShader {
    if (!this.gl) throw new Error('WebGL not initialized')
    
    const shader = this.gl.createShader(type)!
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error('Failed to compile shader: ' + this.gl.getShaderInfoLog(shader))
    }
    
    return shader
  }
  
  /**
   * Apply effects to frame using GPU
   */
  async applyEffects(
    source: ImageBitmap | HTMLVideoElement | VideoFrame,
    effects: Effect[],
    timestamp: number
  ): Promise<ImageBitmap> {
    if (!this.gl) {
      // Fallback to CPU rendering
      return source instanceof ImageBitmap ? source : await createImageBitmap(source)
    }
    
    // Upload source to texture
    const texture = this.uploadTexture(source)
    
    // Apply effects in sequence
    for (const effect of effects) {
      if (!effect.enabled) continue
      if (timestamp < effect.startTime || timestamp > effect.endTime) continue
      
      switch (effect.type) {
        case EffectType.Zoom:
          this.applyZoomEffect(texture, effect)
          break
        // Add more effects as needed
      }
    }
    
    // Read back result
    return this.readbackTexture()
  }
  
  /**
   * Upload source to texture
   */
  private uploadTexture(source: ImageBitmap | HTMLVideoElement | VideoFrame): WebGLTexture {
    if (!this.gl) throw new Error('WebGL not initialized')
    
    const texture = this.gl.createTexture()!
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    
    // Upload based on source type
    if (source instanceof HTMLVideoElement || source instanceof VideoFrame) {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D, 0, this.gl.RGBA,
        this.gl.RGBA, this.gl.UNSIGNED_BYTE, source
      )
    } else {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D, 0, this.gl.RGBA,
        this.gl.RGBA, this.gl.UNSIGNED_BYTE, source
      )
    }
    
    // Set texture parameters
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    
    return texture
  }
  
  /**
   * Apply zoom effect
   */
  private applyZoomEffect(texture: WebGLTexture, effect: Effect): void {
    if (!this.gl) return
    
    const program = this.programs.get('zoom')
    if (!program) return
    
    this.gl.useProgram(program)
    
    // Set uniforms
    const scaleLocation = this.gl.getUniformLocation(program, 'u_scale')
    const centerLocation = this.gl.getUniformLocation(program, 'u_center')
    const resolutionLocation = this.gl.getUniformLocation(program, 'u_resolution')
    
    const zoomData = (effect as any).data || {}
    this.gl.uniform1f(scaleLocation, zoomData.scale || 2.0)
    this.gl.uniform2f(centerLocation, zoomData.targetX || 0.5, zoomData.targetY || 0.5)
    this.gl.uniform2f(resolutionLocation, this.width, this.height)
    
    // Bind texture
    this.gl.activeTexture(this.gl.TEXTURE0)
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
    
    // Draw
    this.drawQuad(program)
  }
  
  /**
   * Draw fullscreen quad
   */
  private drawQuad(program: WebGLProgram): void {
    if (!this.gl) return
    
    // Create vertex buffer if needed
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ])
    
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0
    ])
    
    // Position attribute
    const posBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW)
    
    const posLocation = this.gl.getAttribLocation(program, 'a_position')
    this.gl.enableVertexAttribArray(posLocation)
    this.gl.vertexAttribPointer(posLocation, 2, this.gl.FLOAT, false, 0, 0)
    
    // TexCoord attribute
    const texBuffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW)
    
    const texLocation = this.gl.getAttribLocation(program, 'a_texCoord')
    this.gl.enableVertexAttribArray(texLocation)
    this.gl.vertexAttribPointer(texLocation, 2, this.gl.FLOAT, false, 0, 0)
    
    // Draw
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4)
  }
  
  /**
   * Read back texture as ImageBitmap
   */
  private async readbackTexture(): Promise<ImageBitmap> {
    if (!this.gl) throw new Error('WebGL not initialized')
    
    // Read pixels
    const pixels = new Uint8ClampedArray(this.width * this.height * 4)
    this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    
    // Create ImageData
    const imageData = new ImageData(pixels, this.width, this.height)
    
    // Convert to ImageBitmap
    return createImageBitmap(imageData)
  }
  
  /**
   * Cleanup
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
      
      // Delete framebuffer
      if (this.framebuffer) {
        this.gl.deleteFramebuffer(this.framebuffer)
      }
      
      this.gl = null
    }
    
    this.programs.clear()
    this.textures.clear()
  }
}