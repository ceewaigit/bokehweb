/**
 * Centralized localStorage management for recordings
 * Single source of truth for recording blobs and metadata
 */

import { logger } from '@/lib/utils/logger'
import type { Project, Recording, Clip, CaptureArea, Effect, ZoomEffectData, BackgroundEffectData, CursorEffectData } from '@/types/project'
import { TrackType, EffectType, ExportFormat, QualityLevel, RecordingSourceType, KeystrokePosition } from '@/types/project'
import { EffectsFactory } from '@/lib/effects/effects-factory'

export class RecordingStorage {
  private static readonly BLOB_PREFIX = 'recording-blob-'
  private static readonly PROJECT_PREFIX = 'project-'
  private static readonly PROJECT_PATH_PREFIX = 'project-path-'

  // In-memory metadata cache to avoid localStorage quota
  private static metadataCache = new Map<string, any>()

  // Helper: join paths safely in renderer without path import
  private static joinPath(base: string, ...parts: string[]): string {
    const segments = [base, ...parts].join('/').replace(/\\/g, '/').split('/')
    const filtered: string[] = []
    for (const seg of segments) {
      if (!seg || seg === '.') continue
      if (seg === '..') { filtered.pop(); continue }
      filtered.push(seg)
    }
    return (base.startsWith('/') ? '/' : '') + filtered.join('/')
  }

  // Compute a stable project folder name
  private static sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  }

  // Public: store metadata in memory (no persistence here)
  static setMetadata(recordingId: string, metadata: any): void {
    try {
      this.metadataCache.set(recordingId, metadata)
      logger.debug(`Cached metadata for recording ${recordingId}`)
    } catch (error) {
      logger.error(`Failed to cache metadata for recording ${recordingId}:`, error)
    }
  }

  // Public: get metadata from memory cache
  static getMetadata(recordingId: string): any | null {
    try {
      return this.metadataCache.get(recordingId) || null
    } catch (error) {
      logger.error(`Failed to get cached metadata for recording ${recordingId}:`, error)
      return null
    }
  }

  // Filesystem: save metadata as chunked JSON files under recording folder
  static async saveMetadataChunks(recordingFolder: string, metadata: any, chunkTargetSize = 250_000): Promise<{ manifest: Required<NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>>['metadataChunks']> } | null> {
    if (!window.electronAPI?.saveRecording || !window.electronAPI?.getRecordingsDirectory) {
      logger.error('Electron API unavailable for saveMetadataChunks')
      return null
    }

    const kinds: Array<{ key: keyof NonNullable<import('@/types/project').Recording['metadata']>, filePrefix: string }> = [
      { key: 'mouseEvents', filePrefix: 'mouse' },
      { key: 'keyboardEvents', filePrefix: 'keyboard' },
      { key: 'clickEvents', filePrefix: 'click' },
      { key: 'scrollEvents', filePrefix: 'scroll' },
      { key: 'screenEvents', filePrefix: 'screen' },
    ]

    const manifest: any = { mouse: [], keyboard: [], click: [], scroll: [], screen: [] }

    // Ensure folder exists by saving a tiny placeholder file first (mkdir helper not exposed)
    // We'll rely on saveRecording with nested paths; Node will create intermediate dirs via main handler logic if implemented.
    // If not, we must save at least one file to force path creation.

    for (const { key, filePrefix } of kinds) {
      const events: any[] = (metadata?.[key as any] as any[]) || []
      if (!events || events.length === 0) continue

      // Chunk events into roughly chunkTargetSize JSON byte size per file
      let chunkIndex = 0
      let start = 0
      while (start < events.length) {
        // Exponentially back off chunk size to fit target byte size
        let end = Math.min(events.length, start + 5000) // initial guess
        let dataStr = ''
        let iterations = 0
        while (true) {
          const slice = events.slice(start, end)
          dataStr = JSON.stringify({ [key]: slice })
          if (dataStr.length <= chunkTargetSize || end - start <= 50 || iterations > 10) break
          end = Math.floor((start + end) / 2)
          iterations++
        }

        const fileName = `${filePrefix}-${chunkIndex}.json`
        const filePath = this.joinPath(recordingFolder, fileName)
        await window.electronAPI.saveRecording(filePath, new TextEncoder().encode(dataStr).buffer)
        manifest[filePrefix].push(fileName)

        start = end
        chunkIndex++
      }
    }

    return { manifest }
  }

  // Filesystem: load metadata chunks back into a single object
  static async loadMetadataChunks(recordingFolder: string, metadataChunks: NonNullable<Pick<import('@/types/project').Recording, 'metadataChunks'>['metadataChunks']>): Promise<any> {
    if (!window.electronAPI?.readLocalFile) {
      logger.error('Electron API unavailable for loadMetadataChunks')
      return {}
    }

    const api = window.electronAPI!

    const combine = async (files?: string[]) => {
      const list = files || []
      const all: any[] = []
      for (const name of list) {
        const filePath = this.joinPath(recordingFolder, name)
        const res = await api.readLocalFile!(filePath)
        if (res?.success && res.data) {
          try {
            const json = JSON.parse(new TextDecoder().decode(res.data))
            const arr = (json && Object.values(json)[0]) as any[]
            if (Array.isArray(arr)) all.push(...arr)
          } catch (e) {
            logger.error('Failed parsing metadata chunk', name, e)
          }
        }
      }
      return all
    }

    const mouseEvents = await combine(metadataChunks.mouse)
    const keyboardEvents = await combine(metadataChunks.keyboard)
    const clickEvents = await combine(metadataChunks.click)
    const scrollEvents = await combine(metadataChunks.scroll)
    const screenEvents = await combine(metadataChunks.screen)

    return {
      mouseEvents,
      keyboardEvents,
      clickEvents,
      scrollEvents,
      screenEvents,
    }
  }

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

  // setMetadata/getMetadata replaced above with in-memory cache

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
            type: TrackType.Video,
            clips: [],
            muted: false,
            locked: false
          },
          {
            id: 'audio-1',
            name: 'Audio',
            type: TrackType.Audio,
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
          format: ExportFormat.MP4,
          codec: 'h264',
          quality: QualityLevel.High,
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
    // Deep clone and remove heavy metadata before serialization
    const projectCopy: Project = {
      ...project,
      recordings: project.recordings.map(r => {
        const clone: any = { ...r }
        if ('metadata' in clone) delete clone.metadata
        return clone
      })
    }

    if (typeof window !== 'undefined' && window.electronAPI?.saveRecording && window.electronAPI?.getRecordingsDirectory) {
      try {
        const recordingsDir = await window.electronAPI.getRecordingsDirectory()
        // Use folder-based project layout: <recordingsDir>/<projectName>/<projectId>.ssproj
        const baseName = this.sanitizeName(projectCopy.name || projectCopy.id)
        let projectFolder: string
        if (customPath && customPath.endsWith('.ssproj')) {
          const idx = customPath.lastIndexOf('/')
          projectFolder = idx > 0 ? customPath.slice(0, idx) : recordingsDir
        } else if (customPath && !customPath.endsWith('.ssproj')) {
          projectFolder = customPath
        } else {
          projectFolder = `${recordingsDir}/${baseName}`
        }

        // Persist metadata chunks for each recording if in-memory metadata is present
        for (let i = 0; i < project.recordings.length; i++) {
          const r = project.recordings[i] as any
          if (r?.folderPath && r?.metadata) {
            try {
              const result = await this.saveMetadataChunks(r.folderPath, r.metadata)
              if (result?.manifest) {
                (projectCopy.recordings[i] as any).metadataChunks = result.manifest
              }
            } catch (e) {
              logger.error('Failed to save metadata chunks for', r.id, e)
            }
          }
        }

        const projectFilePath = `${projectFolder}/${projectCopy.id}.ssproj`
        projectCopy.filePath = projectFilePath
        const projectData = JSON.stringify(projectCopy, null, 2)

        await window.electronAPI.saveRecording(projectFilePath, new TextEncoder().encode(projectData).buffer)

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
   * Save recording with project - uses file path from streaming
   */
  static async saveRecordingWithProject(
    videoPath: string,  // File path from streaming
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
      const projectFolder = `${recordingsDir}/${this.sanitizeName(baseName)}`
      const recordingFolder = `${projectFolder}/${recordingId}`

      // Move video file from temp to project folder (new folder structure nests media inside recording folder)
      if (!window.electronAPI?.moveFile) {
        throw new Error('moveFile API not available')
      }

      const ext = videoPath.toLowerCase().endsWith('.mov') ? 'mov' :
        videoPath.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'
      const videoFileName = `${recordingId}.${ext}`
      const videoFilePath = `${recordingFolder}/${videoFileName}`

      const moveResult = await window.electronAPI.moveFile(videoPath, videoFilePath)
      if (!moveResult?.success) {
        throw new Error('Failed to move video file')
      }

      // Get video metadata from the metadata array or fallbacks
      let duration = 0
      let width = 0
      let height = 0

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
      project.filePath = `${projectFolder}/${project.id}.ssproj`

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

      const scrollEvents = metadata
        .filter(m => m.eventType === 'scroll' && m.scrollDelta)
        .map(m => ({
          timestamp: m.timestamp,
          deltaX: m.scrollDelta!.x || 0,
          deltaY: m.scrollDelta!.y || 0
        }))

      console.log('[Recording Storage] Scroll events found:', scrollEvents.length, scrollEvents.slice(0, 5))

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
        sourceType: firstEventWithBounds?.sourceType || RecordingSourceType.Screen,
        sourceId: ''
      } : captureArea

      // Add recording to project
      const recording: Recording = {
        id: recordingId,
        filePath: `${recordingId}/${videoFileName}`,
        duration,
        width,
        height,
        frameRate: 30,
        hasAudio: hasAudio || false,
        captureArea: reconstructedCaptureArea,
        // For folder-based metadata storage
        folderPath: recordingFolder,
        // Keep metadata in memory for immediate use; will be omitted from saved project
        metadata: {
          mouseEvents,
          keyboardEvents,
          clickEvents,
          scrollEvents,
          screenEvents: [],
          captureArea: reconstructedCaptureArea
        },
        // Effects will be created below via createInitialEffectsForRecording
        effects: []
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

      const videoTrack = project.timeline.tracks.find(t => t.type === TrackType.Video)
      if (videoTrack) {
        videoTrack.clips.push(clip)
      }

      project.timeline.duration = duration

      // Create effects on the recording itself (in source space)
      EffectsFactory.createInitialEffectsForRecording(recording)

      // Ensure global effects exist (background, cursor, keystroke)
      EffectsFactory.ensureGlobalEffects(project)

      // Add global keystroke effect if keyboard events exist and not already present
      const hasKeystroke = !!EffectsFactory.getKeystrokeEffect(project.timeline.effects || [])
      if (keyboardEvents.length > 0 && !hasKeystroke) {
        logger.info(`✅ Creating global keystroke effect for ${keyboardEvents.length} keyboard events`)
        project.timeline.effects!.push({
          id: `keystroke-global`,
          type: EffectType.Keystroke,
          startTime: 0,
          endTime: Number.MAX_SAFE_INTEGER,
          data: {
            position: KeystrokePosition.BottomCenter,
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

      // Save metadata chunks under recording folder
      const manifest = await this.saveMetadataChunks(recording.folderPath!, {
        mouseEvents,
        keyboardEvents,
        clickEvents,
        scrollEvents,
        screenEvents: [],
      })

      // Attach manifest to recording
      if (manifest) {
        recording.metadataChunks = manifest.manifest
      }

      // Cache metadata in memory for quick access
      this.setMetadata(recording.id, recording.metadata)

      // Save project file to folder
      const projectPath = await this.saveProject(project, project.filePath)

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
