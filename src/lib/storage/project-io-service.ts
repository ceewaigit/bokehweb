import type { Project, Recording } from '@/types/project'
import { RecordingStorage } from './recording-storage'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { migrationRunner } from '@/lib/migrations'

/**
 * Service for project file I/O operations
 * Extracted from project-store's openProject and saveCurrentProject methods
 */
export class ProjectIOService {
  /**
   * Load a project from filesystem or storage
   */
  static async loadProject(projectPath: string): Promise<Project> {
    let project: Project

    // Check if it's a file path or storage key
    if (projectPath && (projectPath.endsWith('.ssproj') || projectPath.includes('/'))) {
      // Load from filesystem
      if (window.electronAPI?.readLocalFile) {
        const res = await window.electronAPI.readLocalFile(projectPath)
        if (res?.success && res.data) {
          const json = new TextDecoder().decode(res.data)
          project = JSON.parse(json)
        } else {
          throw new Error('Failed to read project file')
        }
      } else {
        // Fallback to storage
        const data = RecordingStorage.getProject(projectPath)
        if (!data) throw new Error('Project not found')
        project = JSON.parse(data)
      }
    } else {
      // Load from storage
      const data = RecordingStorage.getProject(projectPath)
      if (!data) throw new Error('Project not found')
      project = JSON.parse(data)
    }

    // Apply migrations
    project = await this.migrateProject(project)

    // Load metadata and videos
    await this.loadProjectAssets(project)

    return project
  }

  /**
   * Save a project to storage
   */
  static async saveProject(project: Project): Promise<void> {
    // Deep copy to avoid mutating frozen Immer objects.
    // Zoom effects live only in timeline.effects; recording.effects are non-zoom.
    const projectToSave: Project = {
      ...project,
      recordings: project.recordings.map(r => ({
        ...r,
        effects: (r.effects || []).filter(e => e.type !== 'zoom')
      })),
      timeline: {
        ...project.timeline,
        effects: project.timeline.effects || []
      },
      modifiedAt: new Date().toISOString()
    }

    await RecordingStorage.saveProject(projectToSave)
  }

  /**
   * Apply migrations to older project formats
   */
  private static async migrateProject(project: Project): Promise<Project> {
    // Temporary shim for pre-schemaVersion projects created during early dev.
    // Sets schemaVersion to 0 so versioned migrations can run.
    if ((project as any).schemaVersion == null) {
      console.warn('[ProjectIOService] schemaVersion missing; assuming v0 and migrating')
      ;(project as any).schemaVersion = 0
    }

    // Run versioned migrations using MigrationRunner
    let migratedProject = migrationRunner.migrateProject(project)

    return migratedProject
  }

  /**
   * Load project assets (videos and metadata)
   */
  private static async loadProjectAssets(project: Project): Promise<void> {
    const { EffectsFactory } = await import('../effects/effects-factory')
    // Load metadata from chunks if needed (new structure)
    for (const recording of project.recordings) {
      if (recording.folderPath && recording.metadataChunks) {
        // Load metadata from chunks if not already in memory
        if (!recording.metadata || Object.keys(recording.metadata).length === 0) {
          recording.metadata = await RecordingStorage.loadMetadataChunks(
            recording.folderPath,
            recording.metadataChunks
          )
        }
      }

      // Regenerate effects if metadata exists but effects are empty
      if (recording.metadata && (!recording.effects || recording.effects.length === 0)) {
        if (!recording.effects) {
          recording.effects = []
        }
        EffectsFactory.createInitialEffectsForRecording(recording)
      }
    }

    // Load videos with folder path support
    await globalBlobManager.loadVideos(
      project.recordings.map((r: Recording) => ({
        id: r.id,
        filePath: r.filePath,
        folderPath: r.folderPath
      }))
    )
  }

  /**
   * Export a project to a file
   */
  static async exportProject(project: Project, exportPath: string): Promise<void> {
    if (!window.electronAPI?.saveFile) {
      throw new Error('Export not supported in this environment')
    }

    const projectData = JSON.stringify(project, null, 2)
    const encoder = new TextEncoder()
    const data = encoder.encode(projectData)

    const res = await window.electronAPI.saveFile(data, exportPath)
    if (!res?.success) {
      throw new Error('Failed to export project file')
    }
  }

  /**
   * Create a new empty project
   */
  static createNewProject(name: string): Project {
    return RecordingStorage.createProject(name)
  }

  /**
   * Validate project structure
   */
  static validateProject(project: any): project is Project {
    if (!project || typeof project !== 'object') return false
    if (!project.id || !project.name) return false
    if (!project.timeline || !Array.isArray(project.timeline.tracks)) return false
    if (!Array.isArray(project.recordings)) return false

    // Basic structure is valid
    return true
  }

  /**
   * Clean up project resources
   */
  static cleanupProjectResources(): void {
    // Clean up blob resources on next tick (after unmount)
    setTimeout(() => {
      globalBlobManager.cleanupByType('video')
      globalBlobManager.cleanupByType('export')
      globalBlobManager.cleanupByType('thumbnail')
    }, 0)
  }

  /**
   * Get project metadata without loading assets
   */
  static async getProjectMetadata(projectPath: string): Promise<{
    id: string
    name: string
    createdAt: string
    modifiedAt: string
    duration: number
    recordingCount: number
  }> {
    const project = await this.loadProject(projectPath)

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      modifiedAt: project.modifiedAt,
      duration: project.timeline.duration,
      recordingCount: project.recordings.length
    }
  }
}
