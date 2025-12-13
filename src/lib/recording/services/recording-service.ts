/**
 * Recording Service - Orchestrates recording strategies and tracking.
 * This is the main entry point for recording operations.
 */

import type { RecordingSettings } from '@/types'
import type { ElectronRecordingResult, ElectronMetadata } from '@/types/recording'
import { RecordingSourceType } from '@/types'
import { RecordingStrategy, RecordingConfig, RecordingSourceType as StrategySourceType } from '../types/recording-strategy'
import { NativeRecordingStrategy } from '../strategies/native-recording-strategy'
import { MediaRecorderStrategy } from '../strategies/media-recorder-strategy'
import { TrackingService } from './tracking-service'
import { parseAreaSourceId, isAreaSource, isWindowSource } from '../utils/area-source-parser'
import { logger } from '@/lib/utils/logger'
import { PermissionError, ElectronError } from '@/lib/errors'

interface CaptureArea {
  fullBounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  sourceType: RecordingSourceType
  sourceId: string
}

export class RecordingService {
  private strategy: RecordingStrategy | null = null
  private trackingService: TrackingService
  private captureArea: CaptureArea | undefined
  private captureWidth = 0
  private captureHeight = 0

  constructor() {
    this.trackingService = new TrackingService()
  }

  /**
   * Starts a recording with the given settings.
   */
  async start(settings: RecordingSettings): Promise<void> {
    // Check permissions
    await this.checkPermissions()

    // Get source information
    const sourceInfo = await this.getSourceInfo(settings)

    // Select best available strategy
    this.strategy = await this.selectStrategy()
    logger.info(`[RecordingService] Using strategy: ${this.strategy.name}`)

    // Parse recording config
    const config = this.parseConfig(settings, sourceInfo)

    // Start recording
    await this.strategy.start(config)

    // Start tracking
    await this.trackingService.start(
      settings.sourceId!,
      { fullBounds: this.captureArea?.fullBounds, scaleFactor: this.captureArea?.scaleFactor },
      this.captureWidth,
      this.captureHeight
    )
  }

  /**
   * Stops the current recording and returns the result.
   */
  async stop(): Promise<ElectronRecordingResult> {
    if (!this.strategy) {
      throw new Error('No recording in progress')
    }

    // Stop tracking first
    const metadata = await this.trackingService.stop()

    // Stop recording
    const result = await this.strategy.stop()

    const recordingResult: ElectronRecordingResult = {
      videoPath: result.videoPath,
      duration: result.duration,
      metadata,
      captureArea: this.captureArea,
      hasAudio: result.hasAudio
    }

    // Reset state
    this.strategy = null
    this.captureArea = undefined
    this.captureWidth = 0
    this.captureHeight = 0

    return recordingResult
  }

  /**
   * Pauses the current recording.
   */
  pause(): void {
    this.strategy?.pause()
    this.trackingService.pause()
  }

  /**
   * Resumes the current recording.
   */
  resume(): void {
    this.strategy?.resume()
    this.trackingService.resume()
  }

  canPause(): boolean {
    return this.strategy?.canPause() ?? false
  }

  canResume(): boolean {
    return this.strategy?.canResume() ?? false
  }

  isRecording(): boolean {
    return this.strategy?.isRecording() ?? false
  }

  isPaused(): boolean {
    return this.strategy?.isPaused() ?? false
  }

  /**
   * Checks screen recording permissions.
   */
  private async checkPermissions(): Promise<void> {
    if (!window.electronAPI?.getDesktopSources) {
      throw new ElectronError('Electron API not available', 'getDesktopSources')
    }

    if (window.electronAPI?.checkScreenRecordingPermission) {
      const permissionResult = await window.electronAPI.checkScreenRecordingPermission()
      logger.info('[RecordingService] Permission status:', permissionResult)

      if (!permissionResult.granted) {
        if (window.electronAPI?.requestScreenRecordingPermission) {
          await window.electronAPI.requestScreenRecordingPermission()
        }
        throw new PermissionError(
          'Screen recording permission is required.\n\nPlease grant permission in System Preferences > Security & Privacy > Screen Recording, then try again.',
          'screen'
        )
      }
    }
  }

  /**
   * Gets source information and sets up capture area.
   */
  private async getSourceInfo(settings: RecordingSettings): Promise<{ sourceId: string; displayId?: number }> {
    const sources = await window.electronAPI!.getDesktopSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 }
    })

    if (!sources || sources.length === 0) {
      throw new PermissionError('No screen sources available. Please check permissions.', 'screen')
    }

    // Find the requested source
    let primarySource = sources.find(s => s.id === settings.sourceId)

    // Area selections are encoded as "area:x,y,w,h[,displayId]" and won't exist in desktopCapturer sources.
    // Prefer the screen source matching the encoded displayId when possible.
    if (isAreaSource(settings.sourceId)) {
      const area = parseAreaSourceId(settings.sourceId!)
      if (area?.displayId) {
        const matchingScreen = sources.find(s => s.id.startsWith(`screen:${area.displayId}:`))
        if (matchingScreen) {
          primarySource = matchingScreen
        }
      }
    }

    if (!primarySource) {
      // Auto-select screen for fullscreen/region recording
      if (settings.area !== 'window') {
        primarySource = sources.find(s => s.id.startsWith('screen:'))
      }

      if (!primarySource) {
        throw new Error('No suitable recording source found')
      }
    }

    logger.info(`[RecordingService] Using source: ${primarySource.name} (${primarySource.id})`)

    // Get source bounds (in Electron display coordinates)
    if (window.electronAPI?.getSourceBounds) {
      const rawBounds = await window.electronAPI.getSourceBounds(primarySource.id)
      if (rawBounds) {
        let bounds = rawBounds
        let scaleFactor = 1

        // Get display scale factor for screen sources
        if (primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
          try {
            const screens = await window.electronAPI.getScreens()
            const parts = primarySource.id.split(':')
            const displayId = parseInt(parts[1])
            const displayInfo = screens?.find((d: { id: number; scaleFactor?: number }) => d.id === displayId)
            if (displayInfo?.scaleFactor && displayInfo.scaleFactor > 0) {
              scaleFactor = displayInfo.scaleFactor
            }
          } catch (_) {
            // Keep scaleFactor = 1
          }
        }

        // For window sources, infer scale factor from the display containing the window bounds.
        // Some native window-bounds implementations may return physical pixels; normalize back to
        // Electron display coordinates (DIP) so downstream math can consistently apply scaleFactor.
        if (!primarySource.id.startsWith('screen:') && window.electronAPI?.getScreens) {
          try {
            const screens = await window.electronAPI.getScreens()
            const centerX = bounds.x + bounds.width / 2
            const centerY = bounds.y + bounds.height / 2

            const containsPoint = (b: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
              x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height

            // Pass 1: assume bounds are in DIP
            const dipDisplay = screens?.find((d: { bounds: any }) => d?.bounds && containsPoint(d.bounds, centerX, centerY))
            if (dipDisplay?.scaleFactor && dipDisplay.scaleFactor > 0) {
              scaleFactor = dipDisplay.scaleFactor
            } else {
              // Pass 2: assume bounds are in physical pixels; try per-display de-scaling
              const physicalDisplay = screens?.find((d: { bounds: any; scaleFactor?: number }) => {
                const sf = d?.scaleFactor && d.scaleFactor > 0 ? d.scaleFactor : 1
                return d?.bounds && containsPoint(d.bounds, centerX / sf, centerY / sf)
              })
              const sf = physicalDisplay?.scaleFactor && physicalDisplay.scaleFactor > 0 ? physicalDisplay.scaleFactor : 1
              if (physicalDisplay?.bounds) {
                scaleFactor = sf
                bounds = {
                  x: bounds.x / sf,
                  y: bounds.y / sf,
                  width: bounds.width / sf,
                  height: bounds.height / sf
                }
              }
            }
          } catch (_) {
            // Keep defaults
          }
        }

        let effectiveBounds = bounds
        let sourceType = primarySource.id.startsWith('screen:') ? RecordingSourceType.Screen : RecordingSourceType.Window
        let sourceId = primarySource.id

        // For area selections, set capture bounds to the selected region (in global display coordinates).
        if (isAreaSource(settings.sourceId)) {
          const area = parseAreaSourceId(settings.sourceId!)
          if (area) {
            effectiveBounds = {
              x: bounds.x + area.x,
              y: bounds.y + area.y,
              width: area.width,
              height: area.height
            }
            sourceType = RecordingSourceType.Area
            sourceId = settings.sourceId!
          }
        }

        this.captureArea = {
          fullBounds: effectiveBounds,
          workArea: effectiveBounds,
          scaleFactor,
          sourceType,
          sourceId
        }

        this.captureWidth = Math.round(effectiveBounds.width * scaleFactor)
        this.captureHeight = Math.round(effectiveBounds.height * scaleFactor)
      }
    }

    const parsedDisplayId =
      typeof (primarySource as any).display_id === 'string' ? Number((primarySource as any).display_id) : undefined

    return {
      sourceId: primarySource.id,
      displayId: Number.isFinite(parsedDisplayId) ? parsedDisplayId : undefined
    }
  }

  /**
   * Selects the best available recording strategy.
   */
  private async selectStrategy(): Promise<RecordingStrategy> {
    const native = new NativeRecordingStrategy()
    if (await native.isAvailable()) {
      logger.info('[RecordingService] Native ScreenCaptureKit available')
      return native
    }

    const mediaRecorder = new MediaRecorderStrategy()
    if (await mediaRecorder.isAvailable()) {
      logger.info('[RecordingService] Falling back to MediaRecorder')
      return mediaRecorder
    }

    throw new Error('No recording strategy available')
  }

  /**
   * Parses recording settings into a strategy config.
   */
  private parseConfig(settings: RecordingSettings, sourceInfo: { sourceId: string; displayId?: number }): RecordingConfig {
    let sourceType: StrategySourceType = 'screen'
    let bounds: RecordingConfig['bounds']

    if (isAreaSource(settings.sourceId)) {
      sourceType = 'area'
      const areaBounds = parseAreaSourceId(settings.sourceId!)
      if (areaBounds) {
        bounds = {
          x: areaBounds.x,
          y: areaBounds.y,
          width: areaBounds.width,
          height: areaBounds.height
        }
      }
    } else if (isWindowSource(settings.sourceId)) {
      sourceType = 'window'
    }

    return {
      sourceId: settings.sourceId || sourceInfo.sourceId,
      sourceType,
      hasAudio: settings.audioInput !== 'none',
      bounds,
      displayId: sourceInfo.displayId
    }
  }
}
