import type { Effect, Recording, Clip, Project, ZoomEffectData, BackgroundEffectData, CursorEffectData, KeystrokeEffectData, ScreenEffectData } from '@/types/project'
import { EffectType } from '@/types/project'
import {
  DEFAULT_BACKGROUND_DATA,
  DEFAULT_CURSOR_DATA,
  DEFAULT_KEYSTROKE_DATA,
  getDefaultWallpaper
} from '@/lib/constants/default-effects'

export class EffectsFactory {
  // NOTE: createZoomEffectsFromRecording removed - zoom effects are created on-demand
  // via the sidebar and stored in timeline.effects (timeline-space), not recording.effects
  static createDefaultBackgroundEffect(): Effect {
    const defaultWallpaper = getDefaultWallpaper()
    return {
      id: `background-global`,
      type: EffectType.Background,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        ...DEFAULT_BACKGROUND_DATA,
        wallpaper: defaultWallpaper
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
        ...DEFAULT_CURSOR_DATA,
      } as CursorEffectData,
      enabled: true
    }
  }

  static createDefaultKeystrokeEffect(options?: { id?: string; enabled?: boolean }): Effect {
    return {
      id: options?.id ?? `keystroke-global`,
      type: EffectType.Keystroke,
      startTime: 0,
      endTime: Number.MAX_SAFE_INTEGER,
      data: {
        ...DEFAULT_KEYSTROKE_DATA,
      } as KeystrokeEffectData,
      enabled: options?.enabled ?? true
    }
  }
  static createInitialEffectsForRecording(
    recording: Recording,
    existingGlobalEffects: Effect[] = []
  ): void {
    // Initialize effects array if not present
    if (!recording.effects) {
      recording.effects = []
    }

    // NOTE: Zoom effects are NOT auto-created here anymore.
    // They are created on-demand via the zoom toggle in the sidebar.
    // This ensures zoom effects are stored in timeline.effects (timeline-space)
    // rather than recording.effects (source-space), which decouples them from clips.
  }

  static ensureGlobalEffects(project: Project): void {
    // Ensure global effects array exists
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }

    // Add default background if not present
    const hasBackground = project.timeline.effects.some(e => e.type === EffectType.Background)
    if (!hasBackground) {
      project.timeline.effects.push(this.createDefaultBackgroundEffect())
    }

    // Add default cursor if not present
    const hasCursor = project.timeline.effects.some(e => e.type === EffectType.Cursor)
    if (!hasCursor) {
      project.timeline.effects.push(this.createDefaultCursorEffect())
    }
  }
  static getEffectsInTimeRange(effects: Effect[], startTime: number, endTime: number): Effect[] {
    return effects.filter(effect =>
      effect.startTime < endTime && effect.endTime > startTime
    )
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
    // Find the clip
    let clip: Clip | null = null
    for (const track of project.timeline.tracks) {
      clip = track.clips.find(c => c.id === clipId) || null
      if (clip) break
    }
    if (!clip) return []

    // Find the recording
    const recording = project.recordings.find(r => r.id === clip.recordingId)
    if (!recording || !recording.effects) return []

    // Filter effects to only those that overlap with clip's source range
    // Effects are in source space (recording time), clip references source via sourceIn/sourceOut
    return recording.effects.filter(effect => {
      // Check if effect overlaps with clip's source range
      // Effect is visible if: effect.startTime < clip.sourceOut AND effect.endTime > clip.sourceIn
      return effect.startTime < clip.sourceOut && effect.endTime > clip.sourceIn
    })
  }
  static ensureEffectsArray(project: Project): void {
    if (!project.timeline.effects) {
      project.timeline.effects = []
    }
  }
  static addEffectToProject(project: Project, effect: Effect): void {
    // Zoom effects can now be added to timeline.effects (timeline-space)
    // This enables zoom effects to apply to any clip at that timeline position,
    // regardless of which recording the clip comes from
    this.ensureEffectsArray(project)
    project.timeline.effects!.push(effect)
    project.modifiedAt = new Date().toISOString()
  }

  // NOTE: addEffectToRecording removed - all effects should go to timeline.effects now
  // Use addEffectToProject instead
  static removeEffectFromProject(project: Project, effectId: string): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) {
      return false
    }

    if (located.scope === 'timeline') {
      const effects = project.timeline.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    } else if (located.scope === 'recording' && located.recording) {
      const effects = located.recording.effects || []
      const index = effects.findIndex(e => e.id === effectId)
      if (index !== -1) {
        effects.splice(index, 1)
        project.modifiedAt = new Date().toISOString()
        return true
      }
    }

    return false
  }

  static updateEffectInProject(project: Project, effectId: string, updates: Partial<Effect>): boolean {
    const located = this.findEffectInProject(project, effectId)
    if (!located) {
      return false
    }

    // Apply updates to the effect
    // CRITICAL: Deep merge the data object to preserve existing properties
    if (updates.data && located.effect.data) {
      Object.assign(located.effect, updates, {
        data: { ...located.effect.data, ...updates.data }
      })
    } else {
      Object.assign(located.effect, updates)
    }

    project.modifiedAt = new Date().toISOString()
    return true
  }

  private static findEffectInProject(project: Project, effectId: string): { effect: Effect; scope: 'timeline' | 'recording'; recording?: Recording } | null {
    // Check timeline effects FIRST for zoom effects (new architecture)
    // Zoom effects should be in timeline.effects (timeline-space)
    if (project.timeline.effects) {
      const effect = project.timeline.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'timeline' }
      }
    }

    // Then check recording-level effects (recording-scoped non-zoom effects)
    for (const recording of project.recordings) {
      if (!recording.effects) continue
      const effect = recording.effects.find(e => e.id === effectId)
      if (effect) {
        return { effect, scope: 'recording', recording }
      }
    }

    return null
  }

}
