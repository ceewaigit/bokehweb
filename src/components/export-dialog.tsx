"use client"

import { useState, useEffect } from 'react'
import { useExportStore } from '@/stores/export-store'
import { useProjectStore } from '@/stores/project-store'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Separator } from './ui/separator'
import {
  Download,
  Settings,
  Play,
  FileVideo,
  Image as ImageIcon,
  X,
  Check,
  ChevronRight,
  Film,
  MonitorPlay,
  Smartphone,
  Share2,
  Clapperboard,
  Zap,
  AlertCircle
} from 'lucide-react'
import { cn, clamp } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

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

  const { currentProject } = useProjectStore()

  // Reset export state when project changes to prevent stale data
  useEffect(() => {
    reset()
  }, [currentProject?.id, reset])

  const presets = [
    {
      category: 'Social & Web',
      items: [
        { id: 'youtube-1080p', name: 'YouTube 1080p', desc: 'Standard HD quality', icon: MonitorPlay, details: '1920×1080 • 60fps' },
        { id: 'youtube-1080p-30', name: '1080p 30fps', desc: 'Medium quality', icon: MonitorPlay, details: '1920×1080 • 30fps' },
        { id: 'youtube-4k', name: 'YouTube 4K', desc: 'Ultra HD for big screens', icon: MonitorPlay, details: '3840×2160 • 60fps' },
        { id: 'twitter', name: 'Twitter / X', desc: 'Optimized for feed', icon: Share2, details: '1280×720 • 30fps' },
        { id: 'instagram', name: 'Instagram Square', desc: '1:1 aspect ratio', icon: Smartphone, details: '1080×1080 • 30fps' },
      ]
    },
    {
      category: 'Professional',
      items: [
        { id: 'prores-mov', name: 'ProRes 1080p', desc: 'High bitrate editing ready', icon: Film, details: '1920×1080 • MOV' },
        { id: 'prores-4k', name: 'ProRes 4K', desc: 'Master quality', icon: Clapperboard, details: '3840×2160 • MOV' },
        { id: 'cinema-4k', name: 'Cinema 4K', desc: 'DCI 4K standard', icon: Film, details: '4096×2160 • 24fps' },
      ]
    },
    {
      category: 'Other',
      items: [
        { id: 'gif-small', name: 'Animated GIF', desc: 'Small size for sharing', icon: ImageIcon, details: '480×360 • 15fps' },
      ]
    }
  ]

  const handleExport = async () => {
    if (!currentProject) return

    reset()

    try {
      if (exportSettings.format === 'gif') {
        await exportAsGIF(currentProject)
      } else {
        await exportProject(currentProject)
      }
      toast.success('Export completed')
    } catch (e: any) {
      toast.error(e?.message || 'Export failed')
    }
  }

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId)
    setPreset(presetId)
  }

  const handleSave = async () => {
    if (!lastExport) return
    const mime = lastExport.type || ''
    const extension =
      mime === 'video/mp4' ? 'mp4' :
        mime === 'video/webm' ? 'webm' :
          mime === 'image/gif' ? 'gif' :
            (exportSettings.format === 'gif' ? 'gif' : exportSettings.format)
    const filename = `${currentProject?.name || 'export'}.${extension}`
    try {
      await saveLastExport(filename)
      toast.success('File saved')
      reset()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save file')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-background border border-border/50 rounded-xl w-[900px] max-h-[85vh] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px]">

        {/* Sidebar - Presets */}
        <div className="w-full md:w-[320px] bg-muted/30 border-r border-border/50 flex flex-col h-full">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-6">
              {presets.map((group) => (
                <div key={group.category}>
                  <h3 className="px-3 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">{group.category}</h3>
                  <div className="space-y-1">
                    {group.items.map((preset) => {
                      const Icon = preset.icon
                      const isSelected = selectedPreset === preset.id
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handlePresetSelect(preset.id)}
                          className={cn(
                            "w-full flex items-center p-3 rounded-lg text-left transition-all duration-200 group",
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-md mr-3 transition-colors",
                            isSelected ? "bg-primary-foreground/20" : "bg-muted group-hover:bg-background"
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{preset.name}</div>
                            <div className={cn(
                              "text-xs truncate",
                              isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                            )}>{preset.desc}</div>
                          </div>
                          {isSelected && <ChevronRight className="w-4 h-4 ml-2 opacity-50" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content - Details & Progress */}
        <div className="flex-1 flex flex-col bg-background h-full relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10 hover:bg-muted/50 rounded-full"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex-1 p-8 flex flex-col justify-center items-center text-center space-y-8 overflow-y-auto custom-scrollbar">
            {!isExporting && !lastExport && (
              <div className="w-full max-w-md space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary">
                    <Settings className="w-8 h-8" />
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl border border-border/50 p-6 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Resolution</span>
                    <span className="font-medium font-mono">{exportSettings.resolution.width} × {exportSettings.resolution.height}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Frame Rate</span>
                    <span className="font-medium font-mono">{exportSettings.framerate} FPS</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Format</span>
                    <Badge variant="secondary" className="font-mono uppercase">{exportSettings.format}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Quality</span>
                    <Badge variant="outline" className="capitalize">{exportSettings.quality}</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground bg-muted/20 py-2 px-4 rounded-full w-fit mx-auto">
                  <FileVideo className="w-3 h-3" />
                  <span>{currentProject?.timeline?.tracks?.[0]?.clips?.length || 0} clips</span>
                  <span>•</span>
                  <span>{currentProject?.timeline?.duration ? (currentProject.timeline.duration / 1000).toFixed(1) : '0.0'}s duration</span>
                </div>
              </div>
            )}

            {/* Progress State */}
            {isExporting && progress && (
              <div className="w-full max-w-md space-y-6 animate-in zoom-in-95 duration-300">
                <div className="relative w-24 h-24 mx-auto">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      className="text-muted stroke-current"
                      strokeWidth="8"
                      fill="transparent"
                      r="42"
                      cx="50"
                      cy="50"
                    />
                    <circle
                      className={cn(
                        "stroke-current transition-all duration-500 ease-out",
                        progress.stage === 'error' ? "text-destructive" : "text-primary"
                      )}
                      strokeWidth="8"
                      strokeLinecap="round"
                      fill="transparent"
                      r="42"
                      cx="50"
                      cy="50"
                      strokeDasharray="264"
                      strokeDashoffset={264 - (clamp(progress.progress, 0, 100) / 100) * 264}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="text-2xl font-bold">{Math.round(progress.progress)}%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-medium animate-pulse">{progress.message}</h3>
                  <p className="text-sm text-muted-foreground">
                    Stage: <span className="capitalize">{progress.stage}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Success State */}
            {lastExport && progress?.stage === 'complete' && (
              <div className="w-full max-w-md space-y-6 animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Check className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-green-500">Export Complete!</h3>
                  <p className="text-muted-foreground">
                    Your video is ready to be saved.
                  </p>
                </div>
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50 text-sm text-muted-foreground">
                  {progress.message}
                </div>
              </div>
            )}

            {/* Error State */}
            {progress?.stage === 'error' && (
              <div className="w-full max-w-md space-y-6 animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-destructive">Export Failed</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto">
                    {progress.message}
                  </p>
                </div>
                <Button variant="outline" onClick={reset}>Try Again</Button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-border/50 bg-muted/10 flex justify-end items-center gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>

            {lastExport ? (
              <Button onClick={handleSave} className="min-w-[140px] shadow-lg shadow-primary/20">
                <Download className="w-4 h-4 mr-2" />
                Save File
              </Button>
            ) : (
              <Button
                onClick={handleExport}
                disabled={!currentProject || isExporting}
                className="min-w-[140px] shadow-lg shadow-primary/20"
              >
                {isExporting ? (
                  <>
                    <Zap className="w-4 h-4 mr-2 animate-pulse" />
                    Rendering...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
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
