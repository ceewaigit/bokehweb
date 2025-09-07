'use client'

import React from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import type { Clip, Effect } from '@/types/project'

interface ScreenTabProps {
  selectedClip: Clip | null
  selectedEffectLayer?: { type: 'zoom' | 'cursor' | 'background' | 'screen'; id?: string } | null
  onEffectChange: (type: 'screen', data: any) => void
}

export function ScreenTab({ selectedClip, selectedEffectLayer, onEffectChange }: ScreenTabProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Camera className="w-4 h-4" />
        <span>3D Screen Effects</span>
      </h3>

      {/* Add Screen Block */}
      <div className="p-3 bg-background/30 rounded-lg">
        <button
          className="w-full px-3 py-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-all"
          onClick={() => {
            if (!selectedClip) return
            const newEffect: Effect = {
              id: `screen-${Date.now()}`,
              type: 'screen',
              startTime: selectedClip.startTime,
              endTime: selectedClip.startTime + selectedClip.duration,
              enabled: true,
              data: { preset: 'subtle' }
            }
            useProjectStore.getState().addEffect(newEffect)
          }}
        >
          Add 3D Screen Block
        </button>
        <p className="text-[9px] text-muted-foreground/60 mt-2 italic">
          Creates a block you can resize on the timeline.
        </p>
      </div>

      {/* Show presets only when a screen block is selected */}
      {selectedEffectLayer?.type === 'screen' && selectedEffectLayer?.id ? (
        <div className="p-3 bg-background/30 rounded-lg">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">3D Preset</label>
          <div className="grid grid-cols-2 gap-1">
            {([
              'subtle', 'medium', 'dramatic', 'window', 
              'cinematic', 'hero', 'isometric', 'flat', 
              'tilt-left', 'tilt-right'
            ] as const).map(preset => (
              <button
                key={preset}
                className={cn(
                  'px-2 py-1.5 text-[10px] rounded transition-all capitalize',
                  'bg-background/50 text-muted-foreground hover:bg-background/70'
                )}
                onClick={() => onEffectChange('screen', { preset })}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-background/30 rounded-lg">
          <p className="text-[10px] text-muted-foreground">
            Select a 3D Screen block on the timeline to edit its preset.
          </p>
        </div>
      )}
    </div>
  )
}