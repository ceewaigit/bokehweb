"use client"

import { useState } from 'react'
import { useExportStore } from '@/stores/export-store'
import { useTimelineStore } from '@/stores/timeline-store'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { 
  Download, 
  Settings, 
  Play, 
  FileVideo, 
  Image, 
  X, 
  Check 
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState('youtube-1080p')
  
  const { 
    exportSettings, 
    isExporting, 
    progress, 
    lastExport,
    updateSettings, 
    exportProject, 
    exportAsGIF, 
    saveLastExport, 
    setPreset,
    reset 
  } = useExportStore()
  
  const { project } = useTimelineStore()

  const presets = [
    { id: 'youtube-1080p', name: 'YouTube 1080p', desc: '1920×1080, 60fps, MP4' },
    { id: 'youtube-720p', name: 'YouTube 720p', desc: '1280×720, 60fps, MP4' },
    { id: 'twitter', name: 'Twitter', desc: '1280×720, 30fps, MP4' },
    { id: 'instagram', name: 'Instagram', desc: '1080×1080, 30fps, MP4' },
    { id: 'prores-mov', name: 'ProRes MOV', desc: '1920×1080, 60fps, MOV' },
    { id: 'gif-small', name: 'Small GIF', desc: '480×360, 15fps, GIF' }
  ]

  const handleExport = async () => {
    if (!project) return
    
    reset()
    
    if (exportSettings.format === 'gif') {
      await exportAsGIF(project)
    } else {
      await exportProject(project)
    }
  }

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId)
    setPreset(presetId)
  }

  const handleSave = async () => {
    if (lastExport) {
      const extension = exportSettings.format === 'gif' ? 'gif' : exportSettings.format
      const filename = `${project?.name || 'export'}.${extension}`
      await saveLastExport(filename)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-[600px] max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Export Project</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Presets */}
          <div>
            <h3 className="text-sm font-medium mb-3">Export Presets</h3>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-md border text-left transition-colors",
                    selectedPreset === preset.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div>
                    <div className="font-medium text-sm">{preset.name}</div>
                    <div className="text-xs text-muted-foreground">{preset.desc}</div>
                  </div>
                  {selectedPreset === preset.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Current Settings */}
          <div>
            <h3 className="text-sm font-medium mb-3">Export Settings</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="flex justify-between">
                <span>Format:</span>
                <Badge variant="outline">{exportSettings.format.toUpperCase()}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Quality:</span>
                <Badge variant="outline">{exportSettings.quality}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Resolution:</span>
                <span>{exportSettings.resolution.width}×{exportSettings.resolution.height}</span>
              </div>
              <div className="flex justify-between">
                <span>Frame Rate:</span>
                <span>{exportSettings.framerate} fps</span>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isExporting && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{progress.message}</span>
                <span>{Math.max(0, Math.min(100, progress.progress)).toFixed(0)}%</span>
              </div>
              <Progress value={Math.max(0, Math.min(100, progress.progress))} className="h-2" />
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  progress.stage === 'error' ? 'bg-destructive' : 'bg-primary animate-pulse'
                )} />
                <span>Stage: {progress.stage}</span>
              </div>
            </div>
          )}

          {/* Success State */}
          {lastExport && progress?.stage === 'complete' && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-center space-x-2 text-green-600 text-sm">
                <Check className="w-4 h-4" />
                <span>Export completed successfully!</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {progress?.stage === 'error' && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <div className="text-destructive text-sm">
                {progress.message}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            {project && (
              <>
                <FileVideo className="w-3 h-3" />
                <span>{project.clips.length} clips</span>
                <span>•</span>
                <span>{project.settings.duration.toFixed(1)}s</span>
              </>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {lastExport ? (
              <Button onClick={handleSave} size="sm">
                <Download className="w-4 h-4 mr-2" />
                Save File
              </Button>
            ) : (
              <Button 
                onClick={handleExport} 
                disabled={!project || isExporting}
                size="sm"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Export
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}