"use client"

import { useCallback, useEffect, useState } from 'react'
// Recording logic handled by RecordingController component
import { Toolbar } from '../toolbar'
import { PreviewArea } from '../preview-area'
import dynamic from 'next/dynamic'

const TimelineCanvas = dynamic(
  () => import('../timeline/timeline-canvas').then(mod => mod.TimelineCanvas),
  { ssr: false }
)
import { EffectsSidebar } from '../effects-sidebar'
import { ExportDialog } from '../export-dialog'
import { RecordingsLibrary } from '../recordings-library'
import { RecordingController } from './recording-controller'
import { useProjectStore } from '@/stores/project-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

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

  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')

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

  // Show loading screen when processing
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-50">
        <div className="text-center space-y-6">
          {/* Animated logo or spinner */}
          <div className="relative">
            <div className="w-24 h-24 border-4 border-primary/20 rounded-full animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-t-primary border-r-primary border-b-transparent border-l-transparent rounded-full animate-spin" />
            </div>
          </div>

          {/* Loading message */}
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{loadingMessage}</h3>
            <p className="text-sm text-muted-foreground">Please wait while we set everything up...</p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 justify-center">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  // Show recordings library when no active project
  if (!currentProject) {
    console.log('🔍 WorkspaceManager: Showing recordings library')
    return (
      <div className="fixed inset-0 flex flex-col bg-background">
        <RecordingsLibrary
          onSelectRecording={async (recording) => {
            console.log('🔍 Selected recording:', recording.name)

            // Start loading
            setIsLoading(true)
            setLoadingMessage('Loading recording...')

            try {
              // Check if it's a project file
              if (recording.isProject && recording.project) {
                const project = recording.project
                console.log('📁 Loading project:', project.name)

                setLoadingMessage('Creating project...')
                // Create a new timeline project
                newProject(project.name)

                // Load each recording from the project
                for (let i = 0; i < project.recordings.length; i++) {
                  const rec = project.recordings[i]
                  setLoadingMessage(`Setting up video ${i + 1} of ${project.recordings.length}...`)

                  if (rec.filePath) {
                    try {
                      // Don't load the entire video file! Just verify it exists and get duration if needed

                      // Verify and fix recording duration if needed
                      if (!rec.duration || rec.duration <= 0 || !isFinite(rec.duration)) {
                        setLoadingMessage('Detecting video duration...')
                        console.log('⚠️ Recording has invalid duration, detecting from video...')

                        const tempVideo = document.createElement('video')
                        // Just use the file path directly
                        tempVideo.src = `file://${rec.filePath}`

                        await new Promise<void>((resolve) => {
                          tempVideo.addEventListener('loadedmetadata', () => {
                            console.log('Checking project video duration:', tempVideo.duration)

                            if (tempVideo.duration > 0 && isFinite(tempVideo.duration)) {
                              rec.duration = tempVideo.duration * 1000
                              console.log('✅ Fixed recording duration:', rec.duration, 'ms')
                            } else {
                              console.error('❌ Could not determine video duration')
                            }
                            resolve()
                          }, { once: true })

                          tempVideo.addEventListener('error', () => {
                            console.error('Failed to load video for duration check')
                            resolve()
                          }, { once: true })

                          tempVideo.load()
                        })

                        tempVideo.remove()
                      }

                      // Fix clip durations if recording duration was updated
                      for (const track of project.timeline.tracks) {
                        for (const clip of track.clips) {
                          if (clip.recordingId === rec.id && rec.duration && rec.duration > 0) {
                            clip.duration = Math.min(clip.duration, rec.duration)
                            clip.sourceOut = Math.min(clip.sourceOut, rec.duration)
                          }
                        }
                      }

                      // Load video and metadata together
                      if (rec.filePath || rec.metadata) {
                        setLoadingMessage(`Loading video ${i + 1}...`)
                        await globalBlobManager.loadVideos([{
                          id: rec.id,
                          filePath: rec.filePath,
                          metadata: rec.metadata
                        }])
                        
                        if (rec.metadata) {
                          const totalEvents =
                            (rec.metadata.mouseEvents?.length || 0) +
                            (rec.metadata.clickEvents?.length || 0) +
                            (rec.metadata.keyboardEvents?.length || 0)
                          console.log(`✅ Loaded ${totalEvents} metadata events`)
                        }
                      }
                    } catch (error) {
                      console.error('Failed to load recording from project:', error)
                    }
                  }
                }

                // Set the project ONCE after all recordings are processed
                useProjectStore.getState().setProject(project)

                // Auto-select the first clip if available
                const firstClip = project.timeline.tracks
                  .flatMap(t => t.clips)
                  .sort((a, b) => a.startTime - b.startTime)[0]
                if (firstClip) {
                  console.log('🎯 Auto-selecting first clip:', firstClip.id)
                  useProjectStore.getState().selectClip(firstClip.id)
                }
              } else {
                // Raw video files without project metadata are not supported
                console.error('Cannot load raw video files without project metadata')
                alert('This video file does not have an associated project. Please load a .screencast project file instead.')
                setIsLoading(false)
                setLoadingMessage('')
                return
              }

              // Final setup message
              setLoadingMessage('Finalizing setup...')

              // Small delay to ensure everything is fully rendered
              await new Promise(resolve => setTimeout(resolve, 500))

              // Hide loading screen after everything is loaded
              setIsLoading(false)

            } catch (error) {
              console.error('Failed to load recording:', error)
              setIsLoading(false)
              // Optionally show an error message
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background" style={{ width: '100vw', height: '100vh' }}>
      {/* Top Toolbar - 8vh height */}
      <div className="flex-shrink-0 border-b bg-card/50 overflow-hidden" style={{ height: '8vh', minHeight: '56px' }}>
        <Toolbar
          onToggleProperties={handleToggleProperties}
          onExport={handleExport}
        />
      </div>

      {/* Main Content Area - 92vh height */}
      <div className="flex" style={{ height: '92vh' }}>
        {/* Main Editor Section */}
        <div className="flex flex-col" style={{ width: isPropertiesOpen ? `calc(100vw - ${propertiesPanelWidth}px)` : '100vw' }}>
          {/* Preview Area - 55vh height */}
          <div className="bg-background border-b overflow-hidden" style={{ height: '55vh' }}>
            <PreviewArea />
          </div>

          {/* Timeline Section - 37vh height */}
          <div className="bg-card/50 overflow-hidden" style={{ height: '37vh' }}>
            <TimelineCanvas className="h-full w-full" />
          </div>
        </div>

        {/* Properties Panel - Fixed width when open */}
        {isPropertiesOpen && (
          <div
            className="bg-card border-l overflow-hidden"
            style={{ width: `${propertiesPanelWidth}px`, height: '92vh' }}
          >
            <EffectsSidebar className="h-full w-full" />
          </div>
        )}
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