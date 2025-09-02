/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/lib/utils/logger'
import type { Project, Recording, Clip, CaptureArea, Effect, ZoomEffectData, BackgroundEffectData, CursorEffectData } from '@/types/project'
import { ZoomDetector } from '@/lib/effects/utils/zoom-detector'

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly METADATA_PREFIX = 'recording-metadata-'
  private static readonly PROJECT_PREFIX = 'project-'
  private static readonly PROJECT_PATH_PREFIX = 'project-path-'

  /**
   * Store a recording blob URL
   */
  static setBlobUrl(recordingId: string, url: string): void {
    try {
      localStorage.setItem(`${this.BLOB_PREFIX}${recordingId}`, url)
      logger.debug(`Stored blob URL for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store blob URL for recording ${recordingId}:`, error)
    }
  }

  /**
   * Get a recording blob URL
   */
  static getBlobUrl(recordingId: string): string | null {
    return localStorage.getItem(`${this.BLOB_PREFIX}${recordingId}`)
  }

  /**
   * Clear a recording blob URL
   */
  static clearBlobUrl(recordingId: string): void {
    localStorage.removeItem(`${this.BLOB_PREFIX}${recordingId}`)
    logger.debug(`Cleared blob URL for recording ${recordingId}`)
  }

  /**
   * Store recording metadata
   */
  static setMetadata(recordingId: string, metadata: any): void {
    try {
      const metadataStr = typeof metadata === 'string'
        ? metadata
        : JSON.stringify(metadata)
      localStorage.setItem(`${this.METADATA_PREFIX}${recordingId}`, metadataStr)
      logger.debug(`Stored metadata for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to store metadata for recording ${recordingId}:`, error)
    }
  }

  /**
   * Get recording metadata
   */
  static getMetadata(recordingId: string): any | null {
    try {
      const metadataStr = localStorage.getItem(`${this.METADATA_PREFIX}${recordingId}`)
      if (!metadataStr) return null
      return JSON.parse(metadataStr)
    } catch (error) {
      logger.error(`Failed to parse metadata for recording ${recordingId}:`, error)
      return null
    }
  }

  /**
   * Store project data
   */
  static setProject(projectId: string, projectData: any): void {
    try {
      const dataStr = typeof projectData === 'string'
        ? projectData
        : JSON.stringify(projectData)
      localStorage.setItem(`${this.PROJECT_PREFIX}${projectId}`, dataStr)
      logger.debug(`Stored project ${projectId}`)
    } catch (error) {
      logger.error(`Failed to store project ${projectId}:`, error)
    }
  }

  /**
   * Get project data
   */
  static getProject(projectId: string): any | null {
    try {
      const projectStr = localStorage.getItem(`${this.PROJECT_PREFIX}${projectId}`)
      if (!projectStr) return null
      return JSON.parse(projectStr)
    } catch (error) {
      logger.error(`Failed to parse project ${projectId}:`, error)
      return null
    }
  }

  /**
   * Store project path
   */
  static setProjectPath(projectId: string, path: string): void {
    try {
      localStorage.setItem(`${this.PROJECT_PATH_PREFIX}${projectId}`, path)
      logger.debug(`Stored project path for ${projectId}: ${path}`)
    } catch (error) {
      logger.error(`Failed to store project path for ${projectId}:`, error)
    }
  }

  /**
   * Clear all blob URLs from localStorage (useful on app startup)
   * Since blob URLs are session-specific and become invalid after restart
   */
  static clearAllBlobUrls(): void {
    const keysToRemove: string[] = []

    // Find all blob URL keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(this.BLOB_PREFIX)) {
        keysToRemove.push(key)
      }
    }

    // Remove all blob URL entries
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    if (keysToRemove.length > 0) {
      logger.info(`Cleared ${keysToRemove.length} cached blob URLs on startup`)
    }
  }

  /**
   * Create a new project with default settings
   */
  static createProject(name: string): Project {
    return {
      version: '1.0.0',
      id: `project-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      recordings: [],
      timeline: {
        tracks: [
          {
            id: 'video-1',
            name: 'Video',
            type: 'video',
            clips: [],
            muted: false,
            locked: false
          },
          {
            id: 'audio-1',
            name: 'Audio',
            type: 'audio',
            clips: [],
            muted: false,
            locked: false
          }
        ],
        duration: 0,
        effects: []  // Initialize effects array
      },
      settings: {
        resolution: { width: 1920, height: 1080 },
        frameRate: 60,
        backgroundColor: '#000000'
      },
      exportPresets: [
        {
          id: 'default',
          name: 'Default',
          format: 'mp4',
          codec: 'h264',
          quality: 'high',
          resolution: { width: 1920, height: 1080 },
          frameRate: 60
        }
      ]
    }
  }

  /**
   * Save project to file system
   */
  static async saveProject(project: Project, customPath?: string): Promise<string | null> {
    const projectCopy = { ...project }

    if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
      try {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()

        let projectFilePath: string
        if (projectCopy.filePath && !customPath) {
          projectFilePath = projectCopy.filePath
        } else {
          const projectFileName = customPath || `${projectCopy.id}.ssproj`
          projectFilePath = projectFileName.startsWith('/') ? projectFileName : `${recordingsDir}/${projectFileName}`
        }

        projectCopy.filePath = projectFilePath
        const projectData = JSON.stringify(projectCopy, null, 2)

        await window.electronAPI.saveRecording(
          projectFilePath,
          new TextEncoder().encode(projectData).buffer
        )

        this.setProject(projectCopy.id, projectData)
        this.setProjectPath(projectCopy.id, projectFilePath)

        logger.info(`Project saved to: ${projectFilePath}`)
        return projectFilePath
      } catch (error) {
        console.error('Failed to save project file:', error)
        const projectData = JSON.stringify(projectCopy, null, 2)
        this.setProject(projectCopy.id, projectData)
        return null
      }
    } else {
      const projectData = JSON.stringify(projectCopy, null, 2)
      this.setProject(projectCopy.id, projectData)
      return null
    }
  }

  /**
   * Save recording with project - moved from project-store.ts
   */
  static async saveRecordingWithProject(
    videoBlob: Blob,
    metadata: any[],
    projectName?: string,
    captureArea?: CaptureArea,
    hasAudio?: boolean,
    durationOverrideMs?: number
  ): Promise<{ project: Project; videoPath: string; projectPath: string } | null> {
    if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
      return null
    }

    try {
      const recordingsDir = await window.electronAPI.getRecordingsDirectory()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const baseName = projectName || `Recording_${timestamp}`
      const recordingId = `recording-${Date.now()}`

      // Save video file
      const isQuickTime = !!videoBlob.type && (videoBlob.type.includes('quicktime') || videoBlob.type.includes('mov'))
      const videoFileName = `${baseName}.${isQuickTime ? 'mov' : 'webm'}`
      const videoFilePath = `${recordingsDir}/${videoFileName}`
      const buffer = await videoBlob.arrayBuffer()
      await window.electronAPI.saveRecording(videoFilePath, buffer)

      // Get video metadata with robust fallback (Chromium may not load .mov)
      let duration = 0
      let width = 0
      let height = 0

      const videoUrl = URL.createObjectURL(videoBlob)
      const video = document.createElement('video')
      video.src = videoUrl

      const loaded = await new Promise<boolean>((resolve) => {
        let settled = false
        const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok) } }
        video.onloadedmetadata = () => done(true)
        video.onerror = () => done(false)
        setTimeout(() => done(false), 3000)
      })

      if (loaded) {
        await new Promise<void>((resolve) => {
          if (!isFinite(video.duration)) {
            video.currentTime = Number.MAX_SAFE_INTEGER
            video.onseeked = () => {
              video.onseeked = null
              video.currentTime = 0
              resolve()
            }
          } else {
            resolve()
          }
        })

        if (isFinite(video.duration) && video.duration > 0) {
          duration = video.duration * 1000
          width = video.videoWidth
          height = video.videoHeight
        }
      }

      URL.revokeObjectURL(videoUrl)

      // Fallbacks if metadata could not be read (e.g., QuickTime in Chromium)
      if (duration <= 0) {
        const lastTs = (metadata && metadata.length > 0) ? (metadata[metadata.length - 1].timestamp || 0) : 0
        duration = durationOverrideMs || lastTs || 0
      }
      if (!width || !height) {
        const scale = captureArea?.scaleFactor || 1
        width = (captureArea?.fullBounds?.width ? Math.round(captureArea.fullBounds.width * scale) : width) || width || 1920
        height = (captureArea?.fullBounds?.height ? Math.round(captureArea.fullBounds.height * scale) : height) || height || 1080
      }

      // Create project with recording
      const project = this.createProject(baseName)

      // Get capture dimensions from first mouse event (they all have it now)
      const firstMouseEvent = metadata.find(m => m.eventType === 'mouse' && m.captureWidth && m.captureHeight)
      const captureWidth = firstMouseEvent?.captureWidth || captureArea?.fullBounds?.width || width
      const captureHeight = firstMouseEvent?.captureHeight || captureArea?.fullBounds?.height || height

      const firstEventWithBounds = metadata.find(m => m.sourceBounds)
      const sourceBounds = firstEventWithBounds?.sourceBounds

      const mouseEvents = metadata
        .filter(m => m.eventType === 'mouse' && m.mouseX !== undefined && m.mouseY !== undefined)
        .map(m => ({
          timestamp: m.timestamp,
          x: m.mouseX!,
          y: m.mouseY!,
          screenWidth: m.screenWidth || captureWidth,
          screenHeight: m.screenHeight || captureHeight,
          captureWidth: m.captureWidth || captureWidth,
          captureHeight: m.captureHeight || captureHeight,
          cursorType: m.cursorType
        }))

      const clickEvents = metadata
        .filter(m => m.eventType === 'click' && m.mouseX !== undefined && m.mouseY !== undefined)
        .map(m => ({
          timestamp: m.timestamp,
          x: m.mouseX!,
          y: m.mouseY!,
          button: m.key || 'left' as const
        }))

      // Filter out standalone modifier keys (CapsLock, Shift, etc.) but keep them when combined with other keys
      const modifierKeys = ['CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'Command', 'Option', 'Fn']

      const keyboardEvents = metadata
        .filter(m => m.eventType === 'keypress' && m.keyEventType === 'keydown')
        .filter(m => !modifierKeys.includes(m.key))  // Filter out standalone modifier keys
        .map(m => ({
          timestamp: m.timestamp,
          key: m.key || '',
          modifiers: m.modifiers || []
        }))

      logger.info(`📊 Saving recording with ${keyboardEvents.length} keyboard events`)

      const reconstructedCaptureArea = sourceBounds ? {
        fullBounds: sourceBounds,
        workArea: sourceBounds,
        scaleFactor: 1,
        sourceType: firstEventWithBounds?.sourceType || 'screen',
        sourceId: ''
      } : captureArea

      // Add recording to project
      const recording: Recording = {
        id: recordingId,
        filePath: videoFileName,
        duration,
        width,
        height,
        frameRate: 30,
        hasAudio: hasAudio || false,
        captureArea: reconstructedCaptureArea,
        metadata: {
          mouseEvents,
          keyboardEvents,
          clickEvents,
          screenEvents: [],
          captureArea: reconstructedCaptureArea
        }
      }

      project.recordings.push(recording)

      // Create and add clip (without effects)
      const clip: Clip = {
        id: `clip-${Date.now()}`,
        recordingId: recording.id,
        startTime: 0,
        duration,
        sourceIn: 0,
        sourceOut: duration
      }

      const videoTrack = project.timeline.tracks.find(t => t.type === 'video')
      if (videoTrack) {
        videoTrack.clips.push(clip)
      }

      project.timeline.duration = duration

      // Auto-generate zoom effects as separate entities
      const detector = new ZoomDetector()
      const zoomBlocks = detector.detectZoomBlocks(
        mouseEvents,
        captureWidth || width,
        captureHeight || height,
        duration
      )

      // Initialize effects array if needed
      if (!project.timeline.effects) {
        project.timeline.effects = []
      }

      // Add zoom effects with absolute timeline positions
      zoomBlocks.forEach((block, index) => {
        project.timeline.effects!.push({
          id: `zoom-${clip.id}-${index}`,
          type: 'zoom',
          startTime: clip.startTime + block.startTime,
          endTime: clip.startTime + block.endTime,
          data: {
            scale: block.scale,
            targetX: block.targetX,
            targetY: block.targetY,
            introMs: block.introMs || 300,
            outroMs: block.outroMs || 300,
            smoothing: 0.1
          },
          enabled: true
        })
      })

      // Add global background effect if it doesn't exist
      const hasBackground = project.timeline.effects!.some(e => e.type === 'background')
      if (!hasBackground) {
        project.timeline.effects!.push({
          id: `background-global`,
          type: 'background',
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: {
            type: 'wallpaper',
            gradient: {
              colors: ['#2D3748', '#1A202C'],
              angle: 135
            },
            wallpaper: undefined,
            padding: 40,
            cornerRadius: 15,
            shadowIntensity: 85
          },
          enabled: true
        })
      }

      // Add global cursor effect if it doesn't exist
      const hasCursor = project.timeline.effects!.some(e => e.type === 'cursor')
      if (!hasCursor) {
        project.timeline.effects!.push({
          id: `cursor-global`,
          type: 'cursor',
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: {
            style: 'macOS',
            size: 4.0,
            color: '#ffffff',
            clickEffects: true,
            motionBlur: true,
            hideOnIdle: true,
            idleTimeout: 3000
          },
          enabled: true
        })
      }

      // Add global keystroke effect if keyboard events exist and not already present
      const hasKeystroke = project.timeline.effects!.some(e => e.type === 'keystroke')
      if (keyboardEvents.length > 0 && !hasKeystroke) {
        logger.info(`✅ Creating global keystroke effect for ${keyboardEvents.length} keyboard events`)
        project.timeline.effects!.push({
          id: `keystroke-global`,
          type: 'keystroke',
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: {
            position: 'bottom-center',
            fontSize: 16,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            textColor: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            padding: 12,
            fadeOutDuration: 300,
            maxWidth: 300
          },
          enabled: false  // Default to hidden
        })
      } else {
        logger.info('⚠️ No keyboard events detected - skipping keystroke effect')
      }

      // Save project file
      const projectPath = await this.saveProject(project, `${baseName}.ssproj`)

      return {
        project,
        videoPath: videoFilePath,
        projectPath: projectPath || ''
      }
    } catch (error) {
      logger.error('Failed to save recording with project:', error)
      return null
    }
  }

}