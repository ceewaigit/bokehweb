'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Camera,
  Palette,
  MousePointer,
  Square,
  Keyboard,
  Monitor,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Clip, Effect, BackgroundEffectData, CursorEffectData, KeystrokeEffectData } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'

import { BackgroundTab } from './background-tab'
import { CursorTab } from './cursor-tab'
import { KeystrokeTab } from './keystroke-tab'
import { ZoomTab } from './zoom-tab'
import { ShapeTab } from './shape-tab'
import { ScreenTab } from './screen-tab'
import { ClipTab } from './clip-tab'

interface EffectsSidebarProps {
  className?: string
  selectedClip: Clip | null
  effects: Effect[] | undefined
  selectedEffectLayer?: SelectedEffectLayer
  onEffectChange: (type: 'zoom' | 'cursor' | 'keystroke' | 'background' | 'screen' | 'annotation', data: any) => void
}

export function EffectsSidebar({
  className,
  selectedClip,
  effects,
  selectedEffectLayer,
  onEffectChange
}: EffectsSidebarProps) {
  const [activeTab, setActiveTab] = useState<'background' | 'cursor' | 'keystroke' | 'zoom' | 'shape' | 'screen' | 'clip'>('background')

  // Extract current effects from the array
  const backgroundEffect = effects?.find(e => e.type === 'background' && e.enabled)
  const cursorEffect = effects?.find(e => e.type === 'cursor')
  const keystrokeEffect = effects?.find(e => e.type === 'keystroke')

  // Track last selected clip id and previous effect layer type to control auto-tab switching
  const lastClipIdRef = React.useRef<string | null>(null)
  const prevEffectTypeRef = React.useRef<EffectLayerType | undefined>(undefined)

  // Update active tab based on selection changes (without overriding manual tab clicks)
  useEffect(() => {
    const currentEffectType = selectedEffectLayer?.type as any | undefined

    // If an effect layer is explicitly selected, always show its tab
    if (currentEffectType) {
      setActiveTab(currentEffectType as any)
    } else {
      // If effect selection was cleared (transition from some type to none), go to clip tab once
      if (prevEffectTypeRef.current) {
        setActiveTab('clip')
      }

      // If a new clip was selected, go to clip tab once
      const currentClipId = selectedClip?.id || null
      if (currentClipId !== lastClipIdRef.current) {
        lastClipIdRef.current = currentClipId
        if (currentClipId) setActiveTab('clip')
      }
    }

    // Remember last effect type
    prevEffectTypeRef.current = currentEffectType
  }, [selectedEffectLayer, selectedClip?.id])

  const updateEffect = useCallback((category: 'cursor' | 'keystroke', updates: any) => {
    const effect = category === 'cursor' ? cursorEffect : keystrokeEffect
    if (effect) {
      const currentData = effect.data as CursorEffectData | KeystrokeEffectData
      onEffectChange(category, { ...currentData, ...updates })
    } else {
      onEffectChange(category, updates)
    }
  }, [cursorEffect, keystrokeEffect, onEffectChange])

  // Update background while preserving existing properties
  const updateBackgroundEffect = useCallback((updates: any) => {
    // If no background effect exists, create it with sensible defaults
    if (!backgroundEffect) {
      onEffectChange('background', {
        type: updates.type || 'gradient',
        gradient: {
          type: 'linear',
          colors: ['#2D3748', '#1A202C'],
          angle: 135
        },
        padding: 40,
        cornerRadius: 15,
        shadowIntensity: 85,
        ...updates
      })
      return
    }

    const currentBg = backgroundEffect.data as BackgroundEffectData

    onEffectChange('background', {
      ...currentBg,
      ...updates
    })
  }, [backgroundEffect, onEffectChange])

  // Direct background updates - removed unnecessary RAF optimization
  const scheduleBackgroundUpdate = updateBackgroundEffect

  return (
    <div className={cn("flex bg-background/95 border-l border-border/50 w-full", className)}>
      {/* Left sidebar with section tabs - fixed width */}
      <div className="w-14 flex-shrink-0 flex flex-col items-center py-3 border-r border-border/30">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('background')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'background'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Background"
          >
            <Palette className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('cursor')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'cursor'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Cursor"
          >
            <MousePointer className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('keystroke')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'keystroke'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Keystroke"
          >
            <Keyboard className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('zoom')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'zoom'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Zoom"
          >
            <Camera className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('shape')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'shape'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Shape"
          >
            <Square className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('screen')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'screen'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Screen Effects"
          >
            <Monitor className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('clip')}
            className={cn(
              "p-2.5 rounded-md transition-all",
              activeTab === 'clip'
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Clip Properties"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Right content area - flexible width */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Selection Indicator */}
        {selectedEffectLayer && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/10">
            <span className="text-xs text-primary/70 font-medium">
              {selectedEffectLayer.type === EffectLayerType.Zoom && selectedEffectLayer.id ?
                `Editing: Zoom Block` :
                (() => {
                  const t = String(selectedEffectLayer.type)
                  return `Editing: ${t.charAt(0).toUpperCase() + t.slice(1)} Layer`
                })()}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-4">
          {activeTab === 'background' && (
            <BackgroundTab
              backgroundEffect={backgroundEffect}
              onUpdateBackground={scheduleBackgroundUpdate}
            />
          )}

          {activeTab === 'cursor' && (
            <CursorTab
              cursorEffect={cursorEffect}
              onUpdateCursor={(updates) => updateEffect('cursor', updates)}
              onEffectChange={(type, data) => onEffectChange(type, data)}
            />
          )}

          {activeTab === 'keystroke' && (
            <KeystrokeTab
              keystrokeEffect={keystrokeEffect}
              onUpdateKeystroke={(updates) => updateEffect('keystroke', updates)}
              onEffectChange={(type, data) => onEffectChange(type, data)}
            />
          )}

          {activeTab === 'zoom' && (
            <ZoomTab
              effects={effects}
              selectedEffectLayer={selectedEffectLayer}
              selectedClip={selectedClip}
              onUpdateZoom={(updates) => onEffectChange('zoom', updates)}
              onEffectChange={(type, data) => onEffectChange(type, data)}
            />
          )}

          {activeTab === 'shape' && (
            <ShapeTab
              backgroundEffect={backgroundEffect}
              onUpdateBackground={scheduleBackgroundUpdate}
            />
          )}

          {activeTab === 'screen' && (
            <ScreenTab
              selectedClip={selectedClip}
              selectedEffectLayer={selectedEffectLayer}
              onEffectChange={(type, data) => onEffectChange(type, data)}
            />
          )}

          {activeTab === 'clip' && (
            <ClipTab
              selectedClip={selectedClip}
            />
          )}
        </div>
      </div>
    </div>
  )
}