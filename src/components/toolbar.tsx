"use client"

import { useState } from 'react'
import {
  Settings,
  Folder,
  Save,
  Download,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  FolderOpen,
  FileVideo,
  PanelRightClose,
  PanelRight
} from 'lucide-react'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { useRecordingStore } from '@/stores/recording-store'
import { cn, formatTime } from '@/lib/utils'
import type { Project } from '@/types/project'

interface ToolbarProps {
  project: Project | null
  onToggleProperties: () => void
  onExport: () => void
  onNewProject: () => void
  onSaveProject: () => Promise<void>
  onOpenProject: (path: string) => Promise<void>
  hasUnsavedChanges?: boolean
}

export function Toolbar({ 
  project,
  onToggleProperties, 
  onExport,
  onNewProject,
  onSaveProject,
  onOpenProject,
  hasUnsavedChanges = false
}: ToolbarProps) {
  const {
    isRecording,
    duration,
    status,
    settings
  } = useRecordingStore()

  const [propertiesOpen, setPropertiesOpen] = useState(true)

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    onToggleProperties()
  }

  return (
    <div className="h-full w-full flex items-center px-2 gap-1 overflow-hidden">
      {/* Left Section - Project Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Logo/Brand - More compact */}
        <div className="flex items-center px-1">
          <FileVideo className="w-4 h-4 text-primary mr-1.5 flex-shrink-0" />
          <span className="font-semibold text-xs bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent whitespace-nowrap">
            Screen Studio
          </span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Project Actions - Compact */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewProject}
          className="text-xs h-8 px-2"
        >
          <Folder className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">New</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (window.electronAPI?.showOpenDialog) {
              try {
                const result = await window.electronAPI.showOpenDialog({
                  properties: ['openFile'],
                  filters: [
                    { name: 'Screen Studio Projects', extensions: ['ssproj'] },
                    { name: 'All Files', extensions: ['*'] }
                  ]
                })

                if (!result.canceled && result.filePaths?.length > 0) {
                  const projectPath = result.filePaths[0]
                  await onOpenProject(projectPath)
                }
              } catch (error) {
                console.error('Failed to open project:', error)
              }
            } else {
              console.log('File dialog not available in browser')
            }
          }}
          className="text-xs h-8 px-2"
        >
          <FolderOpen className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Open</span>
        </Button>

        <Button
          variant={hasUnsavedChanges ? "default" : "ghost"}
          size="sm"
          onClick={onSaveProject}
          disabled={!project}
          className={cn(
            "text-xs h-8 px-2",
            hasUnsavedChanges && "animate-pulse"
          )}
        >
          <Save className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">
            {hasUnsavedChanges ? "Save Changes" : "Save"}
          </span>
          {hasUnsavedChanges && (
            <span className="ml-1 w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
          )}
        </Button>
      </div>

      {/* Center Section - Project Info and Status */}
      <div className="flex-1 flex items-center justify-center gap-1 min-w-0 overflow-hidden">
        {/* Project Name and Time Display */}
        {project && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm font-medium">{project.name}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <span className="font-mono text-muted-foreground">
                {formatTime((project?.timeline?.duration || 0) / 1000)}
              </span>
            </div>
          </div>
        )}

        {/* Recording Status */}
        {status !== 'idle' && (
          <div className="ml-4 flex items-center gap-2 flex-shrink-0">
            <div className={cn(
              "w-2 h-2 rounded-full",
              status === 'recording' && "bg-red-500 animate-pulse",
              status === 'processing' && "bg-yellow-500 animate-pulse",
              status === 'preparing' && "bg-blue-500 animate-pulse"
            )} />
            <span className="text-xs font-medium capitalize">
              {status === 'processing' ? 'Saving...' : status}
            </span>
            {isRecording && (
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(duration / 1000)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Section - Export and Settings */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Audio Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-7 h-7",
              settings.audioInput === 'system' || settings.audioInput === 'both'
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {settings.audioInput === 'none' ?
              <VolumeX className="w-3.5 h-3.5" /> :
              <Volume2 className="w-3.5 h-3.5" />
            }
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-7 h-7",
              settings.audioInput === 'microphone' || settings.audioInput === 'both'
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {settings.audioInput === 'microphone' || settings.audioInput === 'both' ?
              <Mic className="w-3.5 h-3.5" /> :
              <MicOff className="w-3.5 h-3.5" />
            }
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Export Button */}
        <Button
          variant="default"
          size="sm"
          disabled={!project || !project.timeline.tracks[0]?.clips?.length}
          onClick={onExport}
          className="text-xs font-medium h-8 px-2"
        >
          <Download className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Export</span>
        </Button>

        {/* Properties Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleProperties}
          className="w-7 h-7"
        >
          {propertiesOpen ?
            <PanelRightClose className="w-3.5 h-3.5" /> :
            <PanelRight className="w-3.5 h-3.5" />
          }
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}