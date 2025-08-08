"use client"

import { useState, useCallback, useEffect } from 'react'
// Recording logic handled by RecordingController component
import { Toolbar } from '../toolbar'
import { PreviewArea } from '../preview-area'
import { Timeline } from '../timeline'
import { PropertiesPanel } from '../properties-panel'
import { ExportDialog } from '../export-dialog'
import { AnimationOverlay } from '../animation-overlay'
import { WelcomeScreen } from '../welcome-screen'
import { RecordingController } from './recording-controller'
import { useTimelineStore } from '@/stores/timeline-store'
import { cn } from '@/lib/utils'

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


  if (!project) {
    console.log('🔍 WorkspaceManager: No project found, showing welcome screen')
    return (
      <>
        <WelcomeScreen 
          onOpenProject={() => {}}
          onStartRecording={() => {
            console.log('🔍 WelcomeScreen: Start recording clicked')
            // Create a project if none exists
            if (!project) {
              createNewProject(`Recording ${new Date().toLocaleDateString()}`)
              console.log('🔍 WelcomeScreen: Created new project')
            }
            // Dispatch event for RecordingController to handle
            window.dispatchEvent(new CustomEvent('start-recording'))
          }}
        />
      </>
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
          <Timeline />
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
      <AnimationOverlay />

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