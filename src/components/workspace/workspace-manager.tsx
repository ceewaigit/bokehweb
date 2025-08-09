"use client"

import { useState, useCallback, useEffect } from 'react'
// Recording logic handled by RecordingController component
import { Toolbar } from '../toolbar'
import { PreviewArea } from '../preview-area'
import { TimelineEditor } from '../timeline/timeline-editor'
import { PropertiesPanel } from '../properties-panel'
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { RecordingController } from './recording-controller'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import type { Recording } from '@/types/project'

export function WorkspaceManager() {
  const { project, createNewProject } = useProjectStore()
  // Recording is handled by RecordingController
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true)
  const [isExportOpen, setIsExportOpen] = useState(false)

  // Debug: Track project changes
  useEffect(() => {
    console.log('🔍 WorkspaceManager: Project changed:', project?.name || 'null')
  }, [project])

  const handleToggleProperties = useCallback(() => {
    setIsPropertiesOpen(!isPropertiesOpen)
  }, [isPropertiesOpen])

  const handleExport = useCallback(() => {
    setIsExportOpen(true)
  }, [])

  const handleCloseExport = useCallback(() => {
    setIsExportOpen(false)
  }, [])


  // Show recordings library when no active project
  if (!project) {
    console.log('🔍 WorkspaceManager: Showing recordings library')
    return (
      <div className="h-screen w-screen flex flex-col bg-background">
        <RecordingsLibrary
          onSelectRecording={async (recording) => {
            console.log('🔍 Selected recording:', recording.name)

            // Check if it's a project file
            if (recording.isProject && recording.project) {
              const project = recording.project
              console.log('📁 Loading project:', project.name)

              // Create a new timeline project
              createNewProject(project.name)

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
                          localStorage.setItem(`recording-blob-${rec.id}`, url)

                          // Add recording to project store
                          useProjectStore.getState().addRecording(rec, blob)

                          // Save metadata for effects rendering
                          if (rec.metadata) {
                            // Convert project metadata format to ElectronMetadata format
                            const metadata: any[] = rec.metadata.mouseEvents.map(e => ({
                              timestamp: e.timestamp,
                              mouseX: e.x,
                              mouseY: e.y,
                              eventType: 'mouse' as const
                            }))

                            // Add click events
                            rec.metadata.clickEvents.forEach(e => {
                              metadata.push({
                                timestamp: e.timestamp,
                                mouseX: e.x,
                                mouseY: e.y,
                                eventType: 'click' as const
                              })
                            })

                            // Add keyboard events
                            rec.metadata.keyboardEvents.forEach(e => {
                              metadata.push({
                                timestamp: e.timestamp,
                                mouseX: 0,
                                mouseY: 0,
                                eventType: 'keypress' as const,
                                key: e.key
                              })
                            })

                            localStorage.setItem(`recording-metadata-${rec.id}`, JSON.stringify(metadata))
                            console.log(`✅ Loaded ${metadata.length} metadata events for recording ${rec.id}`)
                          }

                          // Store clip effects from project for later use
                          localStorage.setItem(`clip-effects-${clipId}`, JSON.stringify(clip.effects))
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
              createNewProject(recording.name)
              try {
                const result = await window.electronAPI?.readLocalFile?.(recording.path)
                if (!result || !result.success) {
                  throw new Error(result?.error || 'Failed to read local file')
                }
                const arrayBuffer: ArrayBuffer = result.data as ArrayBuffer
                const blob = new Blob([arrayBuffer], { type: 'video/webm' })
                const url = globalBlobManager.create(blob, 'loaded-recording')
                const recordingId = `recording-${Date.now()}`

                // Store blob URL for preview (by id and by path for robustness)
                localStorage.setItem(`recording-blob-${recordingId}`, url)
                localStorage.setItem(`recording-blob-${recording.path}`, url)

                // Create a Recording object
                const rec: Recording = {
                  id: recordingId,
                  filePath: recording.path,
                  duration: 10000, // Default 10 seconds
                  width: typeof window !== 'undefined' ? window.screen.width : 1920,
                  height: typeof window !== 'undefined' ? window.screen.height : 1080,
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

                // Try to load metadata if it exists
                try {
                  const metaKeyPath = `recording-metadata-${recording.path}`
                  const metaByPath = localStorage.getItem(metaKeyPath)
                  if (metaByPath) {
                    localStorage.setItem(`recording-metadata-${recordingId}`, metaByPath)
                  }
                } catch { }
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
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
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

          {/* Timeline Section - Fixed height with better border */}
          <div className="h-64 border-t bg-card/50 backdrop-blur-sm relative z-20">
            <TimelineEditor className="h-full" />
          </div>
        </div>

        {/* Properties Panel - Better animation and styling */}
        <div className={cn(
          "transition-all duration-300 ease-in-out bg-card border-l",
          "shadow-xl",
          isPropertiesOpen ? "w-80" : "w-0"
        )}>
          {isPropertiesOpen && (
            <div className="h-full overflow-hidden">
              <PropertiesPanel />
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