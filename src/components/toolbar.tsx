"use client"

import { useState } from 'react'
import {
  Folder,
  Save,
  Download,
  FolderOpen,
  FileVideo,
  PanelRightClose,
  PanelRight,
  Sun,
  Moon,
  Monitor,
  Library,
  Settings
} from 'lucide-react'
import { Button } from './ui/button'
import { useRecordingStore } from '@/stores/recording-store'
import { cn, formatTime } from '@/lib/utils'
import type { Project } from '@/types/project'
import { useTheme } from '@/contexts/theme-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GlassmorphismSettings } from '@/components/settings/glassmorphism-settings'

interface ToolbarProps {
  project: Project | null
  onToggleProperties: () => void
  onExport: () => void
  onNewProject: () => void | Promise<void>
  onSaveProject: () => Promise<void>
  onOpenProject: (path: string) => Promise<void>
  onBackToLibrary: () => void
  hasUnsavedChanges?: boolean
}

export function Toolbar({
  project,
  onToggleProperties,
  onExport,
  onNewProject,
  onSaveProject,
  onOpenProject,
  onBackToLibrary,
  hasUnsavedChanges = false
}: ToolbarProps) {
  const {
    isRecording,
    duration,
    status
  } = useRecordingStore()

  const { theme, setTheme } = useTheme()
  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleToggleProperties = () => {
    setPropertiesOpen(!propertiesOpen)
    onToggleProperties()
  }

  return (
    <div className="h-full w-full flex items-center px-3 gap-2 overflow-hidden backdrop-blur-sm border-b border-border/50" 
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Left Section - Project Controls */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo/Brand - More compact */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-md">
          <FileVideo className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="font-bold text-[10px] text-primary uppercase tracking-wider whitespace-nowrap">
            Studio
          </span>
        </div>

        <div className="w-px h-5 bg-muted-foreground/20" />

        {/* Back to Library Button */}
        {onBackToLibrary && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLibrary}
              className="h-7 px-2 text-[11px] font-medium hover:bg-muted/30"
            >
              <Library className="w-3 h-3 mr-1 flex-shrink-0" />
              <span className="whitespace-nowrap">Library</span>
            </Button>
            <div className="w-px h-5 bg-muted-foreground/20" />
          </>
        )}

        {/* Project Actions - Compact */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewProject}
          className="h-7 px-2 text-[11px] font-medium hover:bg-card/50"
        >
          <Folder className="w-3 h-3 mr-1 flex-shrink-0" />
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
            }
          }}
          className="h-7 px-2 text-[11px] font-medium hover:bg-card/50"
        >
          <FolderOpen className="w-3 h-3 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">Open</span>
        </Button>

        <Button
          variant={hasUnsavedChanges ? "default" : "ghost"}
          size="sm"
          onClick={onSaveProject}
          disabled={!project}
          className={cn(
            "h-7 px-2 text-[11px] font-medium",
            hasUnsavedChanges ? "bg-primary/20 hover:bg-primary/30" : "hover:bg-muted/30"
          )}
        >
          <Save className="w-3 h-3 mr-1 flex-shrink-0" />
          <span className="whitespace-nowrap">
            Save
          </span>
          {hasUnsavedChanges && (
            <span className="ml-1 w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0" />
          )}
        </Button>
      </div>

      {/* Center Section - Project Info and Status - This area is draggable */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
        {/* Project Name and Time Display */}
        {project && (
          <div className="flex items-center gap-2 px-3 py-1 backdrop-blur-sm rounded-md flex-shrink-0 border border-border/50">
            <span className="text-[11px] font-semibold text-foreground/90">{project.name}</span>
            <span className="text-[10px] text-muted-foreground/50">•</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {formatTime((project?.timeline?.duration || 0) / 1000)}
              </span>
            </div>
          </div>
        )}

        {/* Recording Status */}
        {status !== 'idle' && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-destructive/10 rounded-md flex-shrink-0">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === 'recording' && "bg-red-500 animate-pulse",
              status === 'processing' && "bg-yellow-500 animate-pulse",
              status === 'preparing' && "bg-blue-500 animate-pulse"
            )} />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {status === 'processing' ? 'Saving' : status}
            </span>
            {isRecording && (
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {formatTime(duration / 1000)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Section - Export and Settings - Not draggable */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="w-px h-5 bg-muted-foreground/20" />

        {/* Export Button */}
        <Button
          variant="default"
          size="sm"
          disabled={!project || !project.timeline.tracks[0]?.clips?.length}
          onClick={onExport}
          className="h-7 px-3 text-[11px] font-semibold bg-primary hover:bg-primary/90 shadow-sm"
        >
          <Download className="w-3 h-3 mr-1.5 flex-shrink-0" />
          <span className="whitespace-nowrap">Export</span>
        </Button>

        {/* Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          className="h-7 w-7 hover:bg-card/50"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-card/50"
            >
              {theme === 'light' && <Sun className="w-3.5 h-3.5" />}
              {theme === 'dark' && <Moon className="w-3.5 h-3.5" />}
              {theme === 'system' && <Monitor className="w-3.5 h-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={() => setTheme('light')} className="text-xs">
              <Sun className="w-3 h-3 mr-2" />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')} className="text-xs">
              <Moon className="w-3 h-3 mr-2" />
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')} className="text-xs">
              <Monitor className="w-3 h-3 mr-2" />
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Properties Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleProperties}
          className="h-7 w-7 hover:bg-card/50"
        >
          {propertiesOpen ?
            <PanelRightClose className="w-3.5 h-3.5" /> :
            <PanelRight className="w-3.5 h-3.5" />
          }
        </Button>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md glassmorphism">
          <DialogHeader>
            <DialogTitle>Appearance Settings</DialogTitle>
          </DialogHeader>
          <GlassmorphismSettings />
        </DialogContent>
      </Dialog>
    </div>
  )
}