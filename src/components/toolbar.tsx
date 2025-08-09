"use client"

import { useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
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
    isPlaying,
    play,
    pause,
    seek,
    saveCurrentProject,
    newProject
  } = useProjectStore()

  const [propertiesOpen, setPropertiesOpen] = useState(true)

  const handlePlay = () => {
    isPlaying ? pause() : play()
  }

  const handleRewind = () => {
    seek(Math.max(0, currentTime - 5000))
  }

  const handleForward = () => {
    const duration = currentProject?.timeline?.duration || 0
    seek(Math.min(duration, currentTime + 5000))
  }

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    onToggleProperties()
  }

  return (
    <div className="h-14 flex items-center px-4 space-x-1">
      {/* Left Section - Project Controls */}
      <div className="flex items-center space-x-1">
        {/* Logo/Brand */}
        <div className="flex items-center px-3 py-1 mr-2">
          <FileVideo className="w-5 h-5 text-primary mr-2" />
          <span className="font-semibold text-sm bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Screen Studio
          </span>
        </div>
        
        <Separator orientation="vertical" className="h-8 mx-2" />
        
        {/* Project Actions */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => newProject('New Project')}
          className="text-xs"
        >
          <Folder className="w-4 h-4 mr-1" />
          New
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
          <FolderOpen className="w-4 h-4 mr-1" />
          Open
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={saveCurrentProject}
          disabled={!currentProject}
          className="text-xs"
        >
          <Save className="w-4 h-4 mr-1" />
          Save
        </Button>
      </div>

      {/* Center Section - Playback Controls */}
      <div className="flex-1 flex items-center justify-center space-x-1">
        {currentProject && (
          <>
            <Button
              onClick={handleRewind}
              variant="ghost"
              size="icon"
              className="w-8 h-8"
            >
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button
              onClick={handlePlay}
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20"
            >
              {isPlaying ? 
                <Pause className="w-5 h-5 text-primary" /> : 
                <Play className="w-5 h-5 text-primary ml-0.5" />
              }
            </Button>

            <Button
              onClick={handleForward}
              variant="ghost"
              size="icon"
              className="w-8 h-8"
            >
              <SkipForward className="w-4 h-4" />
            </Button>

            {/* Time Display */}
            <div className="ml-3 flex items-center space-x-1 text-xs">
              <span className="font-mono font-medium text-foreground">
                {formatTime(currentTime / 1000)}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="font-mono text-muted-foreground">
                {formatTime((currentProject?.timeline?.duration || 0) / 1000)}
              </span>
            </div>
          </>
        )}

        {/* Recording Status */}
        {status !== 'idle' && (
          <div className="ml-6 flex items-center space-x-2">
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
      <div className="flex items-center space-x-1">
        {/* Audio Controls */}
        <div className="flex items-center mr-2">
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

        <Separator orientation="vertical" className="h-8 mx-2" />

        {/* Export Button */}
        <Button 
          variant="default" 
          size="sm" 
          disabled={!currentProject || !currentProject.timeline.tracks[0]?.clips?.length}
          onClick={onExport}
          className="text-xs font-medium"
        >
          <Download className="w-4 h-4 mr-1" />
          Export
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