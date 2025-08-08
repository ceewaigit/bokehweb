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
import { useTimelineStore } from '@/stores/timeline-store'
import { cn } from '@/lib/utils'
import { globalBlobManager } from '@/lib/security/blob-url-manager'

export function WorkspaceManager() {
  const { project, createNewProject } = useTimelineStore()
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
            // Create a new project with the recording
            createNewProject(recording.name)
            // Load the video file
            try {
              const response = await fetch(`file://${recording.path}`)
              const blob = await response.blob()
              // Add to timeline
              const url = globalBlobManager.create(blob, 'loaded-recording')
              useTimelineStore.getState().addClip({
                id: `clip-${Date.now()}`,
                type: 'video',
                name: recording.name,
                source: url,
                startTime: 0,
                duration: 10000, // Default 10 seconds, will be updated when video loads
                trackIndex: 0,
                thumbnail: ''
              })
            } catch (error) {
              console.error('Failed to load recording:', error)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Top Toolbar */}
      <Toolbar
        onToggleProperties={handleToggleProperties}
        onExport={handleExport}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview and Timeline Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <PreviewArea />
          <TimelineEditor />
        </div>

        {/* Properties Panel */}
        <div className={cn(
          "transition-all duration-300 ease-smooth border-l border-border",
          isPropertiesOpen ? "w-80" : "w-0 overflow-hidden"
        )}>
          {isPropertiesOpen && <PropertiesPanel />}
        </div>
      </div>

      {/* Animation Overlay */}

      {/* Recording Controller */}
      <RecordingController />

      {/* Dialogs and Modals */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={handleCloseExport}
      />
    </div>
  )
}