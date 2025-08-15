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
import { cn } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'
import { RecordingStorage } from '@/lib/storage/recording-storage'
import type { Recording } from '@/types/project'

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

                    // Add clips from the project timeline
                    for (const track of project.timeline.tracks) {
                      for (const clip of track.clips) {
                        if (clip.recordingId === rec.id) {
                          // Fix clip duration if recording duration was updated
                          if (rec.duration && rec.duration > 0) {
                            clip.duration = Math.min(clip.duration, rec.duration)
                            clip.sourceOut = Math.min(clip.sourceOut, rec.duration)
                          }
                          
                          // Just add the recording with its file path - no blob needed!
                          // The preview area will use the file path directly
                          useProjectStore.getState().setProject(project)

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
                          
                          // Don't store effects in RecordingStorage - they should come from the clip
                          // Effects are now managed directly through the project store
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
                setLoadingMessage('Creating new project...')
                newProject(recording.name)
                
                setLoadingMessage('Analyzing video file...')
                const recordingId = `recording-${Date.now()}`

                // Create a temporary video element to get actual duration
                const tempVideo = document.createElement('video')
                tempVideo.src = `file://${recording.path}`
                
                // Get video metadata
                setLoadingMessage('Analyzing video...')
                await new Promise<void>((resolve, reject) => {
                  tempVideo.addEventListener('loadedmetadata', () => {
                    console.log('Video metadata loaded, duration:', tempVideo.duration)
                    resolve()
                  }, { once: true })
                  
                  tempVideo.addEventListener('error', (e) => {
                    console.error('Video error:', e)
                    reject(new Error('Failed to load video metadata'))
                  }, { once: true })
                  
                  tempVideo.load()
                })

                // Get actual video properties - NO FALLBACKS
                if (!tempVideo.duration || !isFinite(tempVideo.duration) || tempVideo.duration <= 0) {
                  throw new Error(`Invalid video duration: ${tempVideo.duration}`)
                }
                
                const duration = tempVideo.duration * 1000 // Convert to milliseconds
                const width = tempVideo.videoWidth || 1920
                const height = tempVideo.videoHeight || 1080
                
                console.log('📹 Video metadata successfully loaded:', {
                  duration: `${(duration / 1000).toFixed(2)}s`,
                  durationMs: duration,
                  videoDuration: tempVideo.duration,
                  dimensions: `${width}x${height}`
                })

                // Clean up temp video
                tempVideo.remove()

                // Create a Recording object with actual video properties
                const rec: Recording = {
                  id: recordingId,
                  filePath: recording.path,
                  duration: duration,
                  width: width,
                  height: height,
                  frameRate: 60,
                  metadata: {
                    mouseEvents: [],
                    keyboardEvents: [],
                    clickEvents: [],
                    screenEvents: []
                  }
                }

                // Add recording to project store - with NO blob, just the file path!
                setLoadingMessage('Setting up timeline...')
                console.log('📼 Adding recording to project store:', {
                  id: rec.id,
                  duration: `${(rec.duration / 1000).toFixed(2)}s`,
                  dimensions: `${rec.width}x${rec.height}`,
                  filePath: rec.filePath
                })
                
                // Create a dummy blob for now (we need to refactor addRecording later)
                const dummyBlob = new Blob([], { type: 'video/webm' })
                useProjectStore.getState().addRecording(rec, dummyBlob)
                
                // Log the project state after adding
                const projectState = useProjectStore.getState().currentProject
                if (projectState) {
                  console.log('📊 Project state after adding recording:', {
                    name: projectState.name,
                    recordings: projectState.recordings.length,
                    timelineDuration: `${(projectState.timeline.duration / 1000).toFixed(2)}s`,
                    clips: projectState.timeline.tracks.reduce((acc, t) => acc + t.clips.length, 0)
                  })
                }
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
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top Toolbar - Fixed height */}
      <div className="h-14 flex-shrink-0 border-b bg-card/50 overflow-hidden">
        <Toolbar
          onToggleProperties={handleToggleProperties}
          onExport={handleExport}
        />
      </div>

      {/* Main Content Area - Takes remaining space */}
      <div className="flex-1 flex min-h-0">
        {/* Main Editor Section */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Preview Area - Fixed height */}
          <div className="flex-shrink-0 bg-muted/20 border-r">
            <PreviewArea />
          </div>

          {/* Timeline Section - Takes remaining space */}
          <div className="flex-1 border-t bg-card/50 min-h-[200px]">
            <TimelineCanvas className="h-full" />
          </div>
        </div>

        {/* Properties Panel - Fixed width when open */}
        {isPropertiesOpen && (
          <div
            className="flex-shrink-0 bg-card border-l overflow-hidden"
            style={{ width: `${propertiesPanelWidth}px` }}
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