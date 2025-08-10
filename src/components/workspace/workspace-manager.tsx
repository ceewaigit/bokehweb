"use client"

import { useCallback, useEffect } from 'react'
// Recording logic handled by RecordingController component
import { Toolbar } from '../toolbar'
import { PreviewArea } from '../preview-area'
import { TimelineEditor } from '../timeline/timeline-editor'
import { EffectsSidebar } from '../effects-sidebar'
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { RecordingController } from './recording-controller'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { cn } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import type { Recording } from '@/types/project'
import { convertElectronMetadataToProject } from '@/lib/metadata/metadata-converter'

export function WorkspaceManager() {
  const { currentProject, newProject } = useProjectStore()
  const {
    isPropertiesOpen,
    isExportOpen,
    propertiesPanelWidth,
    timelineHeight,
    toggleProperties,
    setExportOpen
  } = useWorkspaceStore()

  // Debug: Track project changes
  useEffect(() => {
    console.log('🔍 WorkspaceManager: Project changed:', currentProject?.name || 'null')
  }, [currentProject])

  const handleToggleProperties = useCallback(() => {
    toggleProperties()
  }, [toggleProperties])

  const handleExport = useCallback(() => {
    setExportOpen(true)
  }, [setExportOpen])

  const handleCloseExport = useCallback(() => {
    setExportOpen(false)
  }, [setExportOpen])


  // Show recordings library when no active project
  if (!currentProject) {
    console.log('🔍 WorkspaceManager: Showing recordings library')
    return (
      <div className="h-full w-full min-h-screen flex flex-col bg-background">
        <RecordingsLibrary
          onSelectRecording={async (recording) => {
            console.log('🔍 Selected recording:', recording.name)

            // Check if it's a project file
            if (recording.isProject && recording.project) {
              const project = recording.project
              console.log('📁 Loading project:', project.name)

              // Create a new timeline project
              newProject(project.name)

              // Load each recording from the project
              for (const rec of project.recordings) {
                if (rec.filePath) {
                  try {
                    // Load the video file
                    const result = await window.electronAPI?.readLocalFile?.(rec.filePath)
                    if (!result || !result.success) {
                      console.error('Failed to load video:', rec.filePath)
                      continue
                    }

                    const arrayBuffer: ArrayBuffer = result.data as ArrayBuffer
                    const blob = new Blob([arrayBuffer], { type: 'video/webm' })
                    const url = globalBlobManager.create(blob, 'project-recording')

                    // Add clips from the project timeline
                    for (const track of project.timeline.tracks) {
                      for (const clip of track.clips) {
                        if (clip.recordingId === rec.id) {
                          const clipId = clip.id

                          // Store blob URL for the recording
                          RecordingStorage.setBlobUrl(rec.id, url)

                          // Add recording to project store
                          useProjectStore.getState().addRecording(rec, blob)

                          // Save metadata for effects rendering
                          if (rec.metadata) {
                            // Store the metadata directly - it's already in the correct project format
                            RecordingStorage.setMetadata(rec.id, rec.metadata)

                            const totalEvents =
                              (rec.metadata.mouseEvents?.length || 0) +
                              (rec.metadata.clickEvents?.length || 0) +
                              (rec.metadata.keyboardEvents?.length || 0)
                            console.log(`✅ Loaded ${totalEvents} metadata events for recording ${rec.id}`)
                          }

                          // Store clip effects from project for later use
                          RecordingStorage.setClipEffects(clipId, clip.effects)
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Failed to load recording from project:', error)
                  }
                }
              }
            } else {
              // Legacy: Load raw video file
              newProject(recording.name)
              try {
                const result = await window.electronAPI?.readLocalFile?.(recording.path)
                if (!result || !result.success) {
                  throw new Error(result?.error || 'Failed to read local file')
                }
                const arrayBuffer: ArrayBuffer = result.data as ArrayBuffer
                const blob = new Blob([arrayBuffer], { type: 'video/webm' })
                const url = globalBlobManager.create(blob, 'loaded-recording')
                const recordingId = `recording-${Date.now()}`

                // Store blob URL for preview (by id only)
                RecordingStorage.setBlobUrl(recordingId, url)

                // Create a Recording object
                const rec: Recording = {
                  id: recordingId,
                  filePath: recording.path,
                  duration: 10000, // Will be updated when video loads
                  width: 1920,
                  height: 1080,
                  frameRate: 60,
                  metadata: {
                    mouseEvents: [],
                    keyboardEvents: [],
                    clickEvents: [],
                    screenEvents: []
                  }
                }

                // Add recording to project store
                useProjectStore.getState().addRecording(rec, blob)
              } catch (error) {
                console.error('Failed to load recording:', error)
              }
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-full w-full min-h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Toolbar - Refined with better spacing */}
      <div className="h-14 border-b bg-card/50 backdrop-blur-sm">
        <Toolbar
          onToggleProperties={handleToggleProperties}
          onExport={handleExport}
        />
      </div>

      {/* Main Content Area - Better structured layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor Section */}
        <div className="flex-1 flex flex-col bg-background">
          {/* Preview Area - Takes up most space */}
          <div className="flex-1 min-h-0 bg-card/30 relative z-10">
            <PreviewArea />
          </div>

          {/* Timeline Section - Dynamic height from store */}
          <div
            className="border-t bg-card/50 backdrop-blur-sm relative z-20"
            style={{ height: `${timelineHeight}px` }}
          >
            <TimelineEditor className="h-full" />
          </div>
        </div>

        {/* Properties Panel - Dynamic width from store */}
        <div
          className={cn(
            "transition-all duration-300 ease-in-out bg-card border-l shadow-xl",
            !isPropertiesOpen && "w-0"
          )}
          style={{ width: isPropertiesOpen ? `${propertiesPanelWidth}px` : 0 }}
        >
          {isPropertiesOpen && (
            <div className="h-full overflow-hidden">
              <EffectsSidebar className="h-full w-full" />
            </div>
          )}
        </div>
      </div>

      {/* Recording Controller - Floating overlay */}
      <RecordingController />

      {/* Dialogs and Modals */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={handleCloseExport}
      />
    </div>
  )
}