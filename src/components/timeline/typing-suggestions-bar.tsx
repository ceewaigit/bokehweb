import React from 'react'
import { Group, Rect, Text } from 'react-konva'
import { TypingPeriod, TypingSuggestions } from '@/lib/timeline/typing-detector'
import { TimeConverter } from '@/lib/timeline/time-converter'
import { useTimelineColors } from '@/lib/timeline/colors'
import type { Clip } from '@/types/project'
import { mapRecordingToClipTime } from '@/lib/timeline/clip-utils'

interface TypingSuggestionsBarProps {
  suggestions: TypingSuggestions
  clipStartTime: number
  clipDuration: number
  clipWidth: number
  pixelsPerMs: number
  clip?: Clip
  onApplySuggestion: (period: TypingPeriod) => void
  onApplyAllSuggestions?: (periods: TypingPeriod[]) => void
  onRemoveSuggestion?: (period: TypingPeriod) => void
  onOpenTypingSuggestion?: (opts: {
    x: number
    y: number
    period: TypingPeriod
    allPeriods: TypingPeriod[]
    onApply: (p: TypingPeriod) => Promise<void>
    onApplyAll: (ps: TypingPeriod[]) => Promise<void>
    onRemove: (p: TypingPeriod) => void
  }) => void
}

export const TypingSuggestionsBar: React.FC<TypingSuggestionsBarProps> = ({
  suggestions,
  clipStartTime,
  clipDuration,
  clipWidth,
  pixelsPerMs,
  clip,
  onApplySuggestion,
  onApplyAllSuggestions,
  onRemoveSuggestion,
  onOpenTypingSuggestion
}) => {
  const colors = useTimelineColors()

  if (!suggestions.periods || suggestions.periods.length === 0) return null

  const clipEndTime = clipStartTime + clipDuration
  const relevantPeriods = suggestions.periods.filter(p => p.startTime < clipEndTime && p.endTime > clipStartTime)
  if (relevantPeriods.length === 0) return null

  const children: React.ReactNode[] = []

  relevantPeriods.forEach((period, index) => {
    let absStart = Math.max(period.startTime, clipStartTime)
    let absEnd = Math.min(period.endTime, clipEndTime)
    if (clip) {
      absStart = Math.max(clip.startTime + mapRecordingToClipTime(clip, period.startTime), clip.startTime)
      absEnd = Math.min(clip.startTime + mapRecordingToClipTime(clip, period.endTime), clip.startTime + clip.duration)
    }

    const relStart = Math.max(0, absStart - clipStartTime)
    const relDuration = Math.max(0, absEnd - absStart)

    const x = TimeConverter.msToPixels(relStart, pixelsPerMs)
    const width = Math.max(60, TimeConverter.msToPixels(relDuration, pixelsPerMs))
    const clampedX = Math.max(0, Math.min(x, clipWidth - 60))
    const clampedWidth = Math.min(width, clipWidth - clampedX)

    if (clampedWidth < 40) return

    const speedColor = period.suggestedSpeedMultiplier >= 2.5 ? '#f59e0b' : period.suggestedSpeedMultiplier >= 2.0 ? '#eab308' : '#84cc16'

    children.push(
      <Group 
        key={`typing-${index}`} 
        x={clampedX} 
        listening={true}
        onClick={(e: any) => {
          // Stop propagation to prevent clip selection
          e.cancelBubble = true
          
          // Open the typing suggestion popover if handler is provided
          if (onOpenTypingSuggestion) {
            const clientX = e.evt.clientX
            const clientY = e.evt.clientY - 44 // raise above bar a bit
            
            onOpenTypingSuggestion({
              x: clientX,
              y: clientY,
              period: period,
              allPeriods: relevantPeriods,
              onApply: async (p) => {
                console.log('[TypingSuggestionsBar] Applying single period:', p);
                await onApplySuggestion(p);
              },
              onApplyAll: onApplyAllSuggestions ? async (ps) => {
                console.log('[TypingSuggestionsBar] Applying all periods:', ps);
                await onApplyAllSuggestions(ps);
              } : undefined,
              onRemove: onRemoveSuggestion ? (p) => {
                console.log('[TypingSuggestionsBar] Removing period:', p);
                onRemoveSuggestion(p);
              } : undefined
            })
          }
        }}
      >
        <Rect
          width={clampedWidth}
          height={24}
          fill={speedColor}
          cornerRadius={6}
          opacity={0.9}
          stroke={'rgba(0,0,0,0.35)'}
          strokeWidth={1}
          shadowColor={'black'}
          shadowBlur={6}
          shadowOpacity={0.25}
          shadowOffsetY={1}
          hitStrokeWidth={8}
        />

        <Text x={6} y={4} text={`${period.suggestedSpeedMultiplier.toFixed(1)}x`} fontSize={10} fill={'#0b0e11'} fontFamily="system-ui" fontStyle="bold" listening={false} />
        {clampedWidth > 60 && (
          <Text x={6} y={14} text={`${Math.round(period.averageWpm)} WPM`} fontSize={9} fill={'#0b0e11'} fontFamily="system-ui" listening={false} />
        )}
        {clampedWidth > 90 && (
          <Text x={clampedWidth - 6} y={4} text={`-${Math.round((period.endTime - period.startTime) * (1 - 1/period.suggestedSpeedMultiplier) / 1000)}s`} fontSize={9} fill={'#0b0e11'} width={clampedWidth - 8} align={'right'} listening={false} />
        )}
      </Group>
    )
  })

  return <Group y={-32}>{children}</Group>
} 