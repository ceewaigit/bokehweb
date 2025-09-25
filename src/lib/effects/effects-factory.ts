import type { Effect, Recording, Clip, Project, ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ScreenEffectData } from '@/types/project'
import { EffectType, BackgroundType, CursorStyle } from '@/types/project'
import { ZoomDetector } from './utils/zoom-detector'
import { getDefaultWallpaper } from '@/lib/constants/default-effects'
import { sourceToTimeline } from '@/lib/timeline/time-space-converter'

export class EffectsFactory {
  static createZoomEffectsFromRecording(recording: Recording, clip: Clip): Effect[] {
    const effects: Effect[] = []
    const zoomDetector = new ZoomDetector()
    const zoomBlocks = zoomDetector.detectZoomBlocks(
      recording.metadata?.mouseEvents || [],
      recording.width || 1920,
      recording.height || 1080,
      recording.duration
    )

    zoomBlocks.forEach((block, index) => {
      // Convert zoom block times from source space to timeline space
      // block.startTime and block.endTime are in source space (recording metadata)
      const timelineStart = sourceToTimeline(block.startTime, clip)
      const timelineEnd = sourceToTimeline(block.endTime, clip)
      
      const zoomEffect: Effect = {
        id: `zoom-${clip.id}-${index}`,
        type: EffectType.Zoom,
        startTime: timelineStart,  // Now in timeline space
        endTime: timelineEnd,      // Now in timeline space
        data: {
          scale: block.scale,
          targetX: block.targetX,
          targetY: block.targetY,
          introMs: block.introMs || 300,
          outroMs: block.outroMs || 300,
          smoothing: 0.1
        } as ZoomEffectData,
        enabled: true
      }
      effects.push(zoomEffect)
    })
    return effects
  }
  static createDefaultBackgroundEffect(): Effect {
    const defaultWallpaper = getDefaultWallpaper()
    return {
      id: `background-global`,
      type: EffectType.Background,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        type: BackgroundType.Wallpaper,
        gradient: {
          colors: ['#2D3748', '#1A202C'],
          angle: 135
        },
        wallpaper: defaultWallpaper,
        padding: 40,
        cornerRadius: 15,
        shadowIntensity: 85
      } as BackgroundEffectData,
      enabled: true
    }
  }
  static createDefaultCursorEffect(): Effect {
    return {
      id: `cursor-global`,
      type: EffectType.Cursor,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        style: CursorStyle.MacOS,
        size: 4.0,
        color: '#ffffff',
        clickEffects: true,
        motionBlur: true,
        hideOnIdle: true,
        idleTimeout: 3000
      } as CursorEffectData,
      enabled: true
    }
  }
  static createInitialEffectsForRecording(
    recording: Recording,
    clip: Clip,
    existingEffects: Effect[] = []
  ): Effect[] {
    const newEffects: Effect[] = []
    const zoomEffects = this.createZoomEffectsFromRecording(recording, clip)
    newEffects.push(...zoomEffects)

    const hasBackground = existingEffects.some(e => e.type === EffectType.Background)
    if (!hasBackground) {
      newEffects.push(this.createDefaultBackgroundEffect())
    }

    const hasCursor = existingEffects.some(e => e.type === EffectType.Cursor)
    if (!hasCursor) {
      newEffects.push(this.createDefaultCursorEffect())
    }
    return newEffects
  }
  static getEffectsInTimeRange(effects: Effect[], startTime: number, endTime: number): Effect[] {
    return effects.filter(effect =>
      effect.startTime < endTime && effect.endTime > startTime
    )
  }
  static shiftEffects(effects: Effect[], windowStart: number, windowEnd: number, delta: number): void {
    if (delta === 0) return
    for (const effect of effects) {
      if (effect.type === EffectType.Background) continue
      if (effect.startTime >= windowStart && effect.endTime <= windowEnd) {
        effect.startTime += delta
        effect.endTime += delta
      }
    }
  }
  static cloneEffect(effect: Effect, newIdSuffix: string): Effect {
    return {
      ...effect,
      id: `${effect.id}-${newIdSuffix}`,
      data: { ...effect.data }
    }
  }
  static mergeEffectUpdates(effect: Effect, updates: Partial<Effect>): Effect {
    const { type: _type, id: _id, ...safeUpdates } = updates
    return {
      ...effect,
      ...safeUpdates,
      data: updates.data ?
        Object.assign({}, effect.data, updates.data) as typeof effect.data :
        effect.data
    }
  }

  static getZoomEffects(effects: Effect[]): Effect[] {
    return effects.filter(e => e.type === EffectType.Zoom && e.enabled)
  }

  static getScreenEffects(effects: Effect[]): Effect[] {
    return effects.filter(e => e.type === EffectType.Screen && e.enabled)
  }

  static getCursorEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Cursor)
  }

  static getKeystrokeEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Keystroke)
  }

  static getBackgroundEffect(effects: Effect[]): Effect | undefined {
    return effects.find(e => e.type === EffectType.Background && e.enabled)
  }
  static getActiveEffectAtTime(effects: Effect[], type: EffectType, time: number): Effect | undefined {
    return effects.find(e =>
      e.type === type &&
      e.enabled &&
      time >= e.startTime &&
      time <= e.endTime
    )
  }
  static hasActiveZoomEffects(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Zoom && e.enabled)
  }
  static hasKeystrokeTrack(effects: Effect[]): boolean {
    return effects.some(e => e.type === EffectType.Keystroke && e.enabled)
  }

  // Type-safe data getters
  static getZoomData(effect: Effect): ZoomEffectData | null {
    if (effect.type !== EffectType.Zoom) return null
    return effect.data as ZoomEffectData
  }

  static getCursorData(effect: Effect): CursorEffectData | null {
    if (effect.type !== EffectType.Cursor) return null
    return effect.data as CursorEffectData
  }

  static getBackgroundData(effect: Effect): BackgroundEffectData | null {
    if (effect.type !== EffectType.Background) return null
    return effect.data as BackgroundEffectData
  }

  static getKeystrokeData(effect: Effect): KeystrokeEffectData | null {
    if (effect.type !== EffectType.Keystroke) return null
    return effect.data as KeystrokeEffectData
  }

  static getScreenData(effect: Effect): ScreenEffectData | null {
    if (effect.type !== EffectType.Screen) return null
    return effect.data as ScreenEffectData
  }
  static getEffectsForClip(project: Project, clipId: string): Effect[] {
    if (!project?.timeline.effects) return []
    let clip: Clip | null = null
    for (const track of project.timeline.tracks) {
      clip = track.clips.find(c => c.id === clipId) || null
      if (clip) break
    }
    if (!clip) return []
    return project.timeline.effects.filter(e =>
      e.startTime < clip.startTime + clip.duration &&
      e.endTime > clip.startTime
    )
  }
  static ensureEffectsArray(project: Project): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }
  }
  static addEffectToProject(project: Project, effect: Effect): void {
    this.ensureEffectsArray(project)
    project.timeline.effects!.push(effect)
    project.modifiedAt = new Date().toISOString()
  }
  static removeEffectFromProject(project: Project, effectId: string): boolean {
    if (!project.timeline.effects) return false
    const index = project.timeline.effects.findIndex(e => e.id === effectId)
    if (index !== -1) {
      project.timeline.effects.splice(index, 1)
      project.modifiedAt = new Date().toISOString()
      return true
    }
    return false
  }
  static updateEffectInProject(project: Project, effectId: string, updates: Partial<Effect>): boolean {
    if (!project.timeline.effects) return false
    const effect = project.timeline.effects.find(e => e.id === effectId)
    if (effect) {
      Object.assign(effect, updates)
      project.modifiedAt = new Date().toISOString()
      return true
    }
    return false
  }

  static splitEffectsForClipSplit(
    effects: Effect[],
    originalClipId: string,
    originalClipStart: number,
    originalClipEnd: number,
    splitTime: number,
    firstClipId: string,
    secondClipId: string
  ): { toRemove: string[]; toAdd: Effect[] } {
    const toRemove: string[] = []
    const toAdd: Effect[] = []

    for (const effect of effects) {
      // Skip global effects (background, cursor)
      if (effect.type === EffectType.Background || effect.type === EffectType.Cursor) {
        continue
      }

      // Check if effect overlaps with the original clip
      if (effect.startTime >= originalClipEnd || effect.endTime <= originalClipStart) {
        continue
      }

      // Check if this effect is associated with the clip being split
      if (effect.id.includes(originalClipId)) {
        // Effect spans across the split point - needs to be split
        if (effect.startTime < splitTime && effect.endTime > splitTime) {
          // Remove original effect
          toRemove.push(effect.id)

          // Create effect for first clip
          const firstEffect: Effect = {
            ...effect,
            id: effect.id.replace(originalClipId, firstClipId),
            endTime: splitTime,
            data: { ...effect.data }
          }
          toAdd.push(firstEffect)

          // Create effect for second clip
          const secondEffect: Effect = {
            ...effect,
            id: effect.id.replace(originalClipId, secondClipId),
            startTime: splitTime,
            data: { ...effect.data }
          }
          toAdd.push(secondEffect)
        }
        // Effect is entirely in the first clip
        else if (effect.endTime <= splitTime) {
          // Remove original and add with updated ID
          toRemove.push(effect.id)
          const updatedEffect: Effect = {
            ...effect,
            id: effect.id.replace(originalClipId, firstClipId),
            data: { ...effect.data }
          }
          toAdd.push(updatedEffect)
        }
        // Effect is entirely in the second clip
        else if (effect.startTime >= splitTime) {
          // Remove original and add with updated ID
          toRemove.push(effect.id)
          const updatedEffect: Effect = {
            ...effect,
            id: effect.id.replace(originalClipId, secondClipId),
            data: { ...effect.data }
          }
          toAdd.push(updatedEffect)
        }
      }
    }

    return { toRemove, toAdd }
  }

  static restoreEffectsForClipMerge(
    originalEffects: Effect[],
    firstClipId: string,
    secondClipId: string,
    originalClipId: string
  ): { toRemove: string[]; toAdd: Effect[] } {
    // This method is for future use when implementing clip merge functionality
    // Currently not used but kept for completeness with split operation
    return {
      toRemove: [], // Would remove split clip effects
      toAdd: originalEffects.filter(e => e.id.includes(originalClipId))
    }
  }
}