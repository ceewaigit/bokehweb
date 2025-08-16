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
import { useProjectStore } from '@/stores/project-store'
import { cn, formatTime } from '@/lib/utils'

interface ToolbarProps {
  onToggleProperties: () => void
  onExport: () => void
}

export function Toolbar({ onToggleProperties, onExport }: ToolbarProps) {
  const {
    isRecording,
    duration,
    status,
    settings
  } = useRecordingStore()

  const {
    currentProject,
    currentTime,
    saveCurrentProject,
    newProject
  } = useProjectStore()

  const [propertiesOpen, setPropertiesOpen] = useState(true)

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    onToggleProperties()
  }

  return (
    <div className="h-full w-full flex items-center px-4 gap-2 overflow-hidden">
      {/* Left Section - Project Controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Logo/Brand */}
        <div className="flex items-center px-2 py-1">
          <FileVideo className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
          <span className="font-semibold text-sm bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent whitespace-nowrap">
            Screen Studio
          </span>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Project Actions */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => newProject('New Project')}
          className="text-xs"
        >
          <Folder className="w-4 h-4 mr-1 flex-shrink-0" />
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
                  const openProject = useProjectStore.getState().openProject
                  await openProject(projectPath)
                }
              } catch (error) {
                console.error('Failed to open project:', error)
              }
            } else {
              console.log('File dialog not available in browser')
            }
          }}
          className="text-xs"
        >
          <FolderOpen className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Open</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={saveCurrentProject}
          disabled={!currentProject}
          className="text-xs"
        >
          <Save className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Save</span>
        </Button>
      </div>

      {/* Center Section - Project Info and Status */}
      <div className="flex-1 flex items-center justify-center gap-1 min-w-0 overflow-hidden">
        {/* Project Name and Time Display */}
        {currentProject && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm font-medium">{currentProject.name}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <span className="font-mono font-medium text-foreground">
                {formatTime(currentTime / 1000)}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="font-mono text-muted-foreground">
                {formatTime((currentProject?.timeline?.duration || 0) / 1000)}
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
              "w-8 h-8",
              settings.audioInput === 'system' || settings.audioInput === 'both'
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {settings.audioInput === 'none' ?
              <VolumeX className="w-4 h-4" /> :
              <Volume2 className="w-4 h-4" />
            }
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "w-8 h-8",
              settings.audioInput === 'microphone' || settings.audioInput === 'both'
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {settings.audioInput === 'microphone' || settings.audioInput === 'both' ?
              <Mic className="w-4 h-4" /> :
              <MicOff className="w-4 h-4" />
            }
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {/* Export Button */}
        <Button
          variant="default"
          size="sm"
          disabled={!currentProject || !currentProject.timeline.tracks[0]?.clips?.length}
          onClick={onExport}
          className="text-xs font-medium"
        >
          <Download className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Export</span>
        </Button>

        {/* Properties Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleProperties}
          className="w-8 h-8"
        >
          {propertiesOpen ?
            <PanelRightClose className="w-4 h-4" /> :
            <PanelRight className="w-4 h-4" />
          }
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}