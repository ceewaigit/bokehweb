"use client"

import { useState, useEffect, useMemo } from 'react'
import { useExportStore } from '@/stores/export-store'
import { useProjectStore } from '@/stores/project-store'
import { Button } from './ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'
import {
  Download,
  Play,
  FileVideo,
  X,
  Check,
  Zap,
  AlertCircle
} from 'lucide-react'
import { cn, clamp } from '@/lib/utils'
import { toast } from 'sonner'
import { ExportFormat, QualityLevel } from '@/types/project'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

type Resolution = '720p' | '1080p' | '4k' | 'original'
type FrameRate = 30 | 60
type Format = 'mp4' | 'prores' | 'gif'

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const {
    exportSettings,
    isExporting,
    progress,
    lastExport,
    updateSettings,
    exportProject,
    exportAsGIF,
    saveLastExport,
    reset
  } = useExportStore()

  const { currentProject } = useProjectStore()

  // Get source resolution from recordings
  const sourceResolution = useMemo(() => {
    if (!currentProject?.recordings?.length) {
      return { width: 1920, height: 1080 }
    }
    // Use the first recording's dimensions as source
    const firstRec = currentProject.recordings[0]
    return {
      width: firstRec.width || 1920,
      height: firstRec.height || 1080
    }
  }, [currentProject?.recordings])

  // Available resolution options based on source - only show what's actually available
  const resolutionOptions = useMemo(() => {
    const options: { value: Resolution; label: string; tooltip: string }[] = []
    const h = sourceResolution.height
    const w = sourceResolution.width

    // Always add "Original" as the top/native option
    options.push({
      value: 'original',
      label: 'Original',
      tooltip: `${w}×${h} · Native`
    })

    // Only add lower resolutions that make sense
    if (h > 1080) {
      options.push({ value: '1080p', label: '1080p', tooltip: '1920×1080' })
    }
    if (h > 720) {
      options.push({ value: '720p', label: '720p', tooltip: '1280×720 · Smaller' })
    }

    return options
  }, [sourceResolution])

  // Default to original (highest/native) resolution
  const [resolution, setResolution] = useState<Resolution>('original')
  const [frameRate, setFrameRate] = useState<FrameRate>(60)
  const [format, setFormat] = useState<Format>('mp4')

  // Update resolution if current selection isn't in available options
  useEffect(() => {
    const availableValues = resolutionOptions.map(o => o.value)
    if (!availableValues.includes(resolution)) {
      setResolution('original')
    }
  }, [resolutionOptions, resolution])

  // Update export settings when controls change
  useEffect(() => {
    const getResolutionDimensions = (res: Resolution) => {
      if (res === 'original') return sourceResolution
      const map: Record<string, { width: number; height: number }> = {
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '4k': { width: 3840, height: 2160 },
      }
      return map[res] || sourceResolution
    }

    const formatMap: Record<Format, ExportFormat> = {
      'mp4': ExportFormat.MP4,
      'prores': ExportFormat.MOV,
      'gif': ExportFormat.GIF,
    }

    const qualityMap: Record<Resolution, QualityLevel> = {
      'original': QualityLevel.High,
      '720p': QualityLevel.Medium,
      '1080p': QualityLevel.High,
      '4k': QualityLevel.Ultra,
    }

    updateSettings({
      resolution: getResolutionDimensions(resolution),
      framerate: format === 'gif' ? 15 : frameRate,
      format: formatMap[format],
      quality: qualityMap[resolution],
    })
  }, [resolution, frameRate, format, updateSettings, sourceResolution])

  // Reset export state when project changes
  useEffect(() => {
    reset()
  }, [currentProject?.id, reset])

  const handleExport = async () => {
    if (!currentProject) return
    reset()

    try {
      if (format === 'gif') {
        await exportAsGIF(currentProject)
      } else {
        await exportProject(currentProject)
      }
      toast.success('Export completed')
    } catch (e: any) {
      toast.error(e?.message || 'Export failed')
    }
  }

  const handleSave = async () => {
    if (!lastExport) return
    const mime = lastExport.type || ''
    const extension =
      mime === 'video/mp4' ? 'mp4' :
        mime === 'video/webm' ? 'webm' :
          mime === 'image/gif' ? 'gif' :
            (format === 'gif' ? 'gif' : format === 'prores' ? 'mov' : 'mp4')
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

  // Segmented control component
  const SegmentedControl = <T extends string | number>({
    value,
    onChange,
    options,
    disabled,
  }: {
    value: T
    onChange: (value: T) => void
    options: { value: T; label: string; tooltip?: string }[]
    disabled?: boolean
  }) => (
    <div className={cn(
      "inline-flex rounded-lg p-1 transition-colors",
      disabled ? "bg-muted/20" : "bg-muted/40"
    )}>
      {options.map((option) => {
        // When disabled, don't show any selection
        const isSelected = !disabled && value === option.value

        const button = (
          <button
            key={String(option.value)}
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            className={cn(
              "relative px-4 py-2 text-[13px] font-medium rounded-md transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isSelected
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                : disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            {option.label}
          </button>
        )

        if (option.tooltip && !disabled) {
          return (
            <Tooltip key={String(option.value)}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{option.tooltip}</TooltipContent>
            </Tooltip>
          )
        }
        return button
      })}
    </div>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-6">
        <div
          className="bg-background border border-border/50 rounded-2xl w-[420px] shadow-2xl shadow-black/50 overflow-hidden"
          style={{
            animation: 'dialogIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <style>{`
            @keyframes dialogIn {
              from { opacity: 0; transform: scale(0.96) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <h2 className="text-sm font-semibold text-foreground">Export</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Ready State */}
            {!isExporting && !lastExport && progress?.stage !== 'error' && (
              <div className="space-y-4">
                {/* Resolution */}
                <div className="flex items-center justify-between">
                  <label className="text-[13px] text-muted-foreground">Resolution</label>
                  <SegmentedControl
                    value={resolution}
                    onChange={setResolution}
                    disabled={format === 'gif'}
                    options={resolutionOptions}
                  />
                </div>

                {/* Frame Rate */}
                <div className="flex items-center justify-between">
                  <label className="text-[13px] text-muted-foreground">Frame Rate</label>
                  <SegmentedControl
                    value={frameRate}
                    onChange={setFrameRate}
                    disabled={format === 'gif'}
                    options={[
                      { value: 30 as FrameRate, label: '30', tooltip: 'Smaller file' },
                      { value: 60 as FrameRate, label: '60', tooltip: 'Smoother' },
                    ]}
                  />
                </div>

                {/* Format */}
                <div className="flex items-center justify-between">
                  <label className="text-[13px] text-muted-foreground">Format</label>
                  <SegmentedControl
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'mp4' as Format, label: 'MP4', tooltip: 'Best compatibility' },
                      { value: 'prores' as Format, label: 'ProRes', tooltip: 'For editing' },
                      { value: 'gif' as Format, label: 'GIF', tooltip: 'Animated' },
                    ]}
                  />
                </div>

                {/* Divider & Summary */}
                <div className="pt-3 mt-1 border-t border-border/30">
                  <div className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                      <FileVideo className="w-3.5 h-3.5" />
                      <span>{currentProject?.timeline?.tracks?.[0]?.clips?.length || 0} clips · {currentProject?.timeline?.duration ? (currentProject.timeline.duration / 1000).toFixed(1) : '0.0'}s</span>
                    </div>
                    <span className="font-medium text-foreground tabular-nums">
                      {format === 'gif'
                        ? '480p · 15fps'
                        : `${exportSettings.resolution.width}×${exportSettings.resolution.height} · ${frameRate}fps`
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Progress State */}
            {isExporting && progress && (() => {
              // Fun loading messages that rotate based on progress
              const funMessages = [
                'Brewing your pixels...',
                'Convincing frames to cooperate...',
                'Teaching bytes to dance...',
                'Polishing each frame...',
                'Assembling movie magic...',
                'Almost there, hang tight...',
                'Making it look good...',
                'Compressing with care...',
                'Frame by frame...',
                'Working on it...',
              ]
              const messageIndex = Math.floor((progress.progress / 100) * (funMessages.length - 1))
              const funMessage = funMessages[Math.min(messageIndex, funMessages.length - 1)]

              return (
                <div className="py-8 space-y-5">
                  <div className="relative w-16 h-16 mx-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        className="stroke-muted/30"
                        strokeWidth="8"
                        fill="transparent"
                        r="42"
                        cx="50"
                        cy="50"
                      />
                      <circle
                        className="stroke-primary transition-all duration-300 ease-out"
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
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-semibold tabular-nums">
                        {Math.round(progress.progress)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] text-muted-foreground">
                      {funMessage}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Success State */}
            {lastExport && progress?.stage === 'complete' && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Check className="w-4.5 h-4.5 text-emerald-500" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Export Complete</p>
                    <p className="text-xs text-muted-foreground">{progress.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {progress?.stage === 'error' && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-4.5 h-4.5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Export Failed</p>
                    <p className="text-xs text-muted-foreground">{progress.message}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="w-full"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border/50 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isExporting}
              className="text-xs"
            >
              Cancel
            </Button>

            {lastExport && progress?.stage === 'complete' ? (
              <Button size="sm" onClick={handleSave} className="text-xs">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Save
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleExport}
                disabled={!currentProject || isExporting}
                className="text-xs"
              >
                {isExporting ? (
                  <>
                    <Zap className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                    Export
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
