'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

import { cn } from '@/lib/utils'
import type { Clip, Effect, BackgroundEffectData, CursorEffectData, KeystrokeEffectData } from '@/types/project'
import { EffectType, BackgroundType } from '@/types/project'
import type { SelectedEffectLayer } from '@/types/effects'
import { EffectLayerType } from '@/types/effects'
import { EffectsFactory } from '@/lib/effects/effects-factory'
import { DEFAULT_BACKGROUND_DATA } from '@/lib/constants/default-effects'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { SIDEBAR_TABS, SidebarTabId } from './constants'

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
  onEffectChange: (type: EffectType, data: any) => void
  onZoomBlockUpdate?: (blockId: string, updates: any) => void
}

export function EffectsSidebar({
  className,
  selectedClip,
  effects,
  selectedEffectLayer,
  onEffectChange,
  onZoomBlockUpdate
}: EffectsSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTabId>(SidebarTabId.Background)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  // Extract current effects from the array using EffectsFactory helpers
  const backgroundEffect = effects ? EffectsFactory.getBackgroundEffect(effects) : undefined
  const cursorEffect = effects ? EffectsFactory.getCursorEffect(effects) : undefined
  const keystrokeEffect = effects ? EffectsFactory.getKeystrokeEffect(effects) : undefined

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
        setActiveTab(SidebarTabId.Clip)
      }

      // If a new clip was selected, go to clip tab once
      const currentClipId = selectedClip?.id || null
      if (currentClipId !== lastClipIdRef.current) {
        lastClipIdRef.current = currentClipId
        if (currentClipId) setActiveTab(SidebarTabId.Clip)
      }
    }

    // Remember last effect type
    prevEffectTypeRef.current = currentEffectType
  }, [selectedEffectLayer, selectedClip?.id])

  const updateEffect = useCallback((category: EffectType.Cursor | EffectType.Keystroke, updates: any) => {
    const effect = category === EffectType.Cursor ? cursorEffect : keystrokeEffect
    const effectType = category
    if (effect) {
      const currentData = effect.data as CursorEffectData | KeystrokeEffectData
      onEffectChange(effectType, { ...currentData, ...updates })
    } else {
      onEffectChange(effectType, updates)
    }
  }, [cursorEffect, keystrokeEffect, onEffectChange])

  // Update background while preserving existing properties
  const updateBackgroundEffect = useCallback((updates: any) => {
    // If no background effect exists, create it with sensible defaults
    if (!backgroundEffect) {
      onEffectChange(EffectType.Background, {
        ...DEFAULT_BACKGROUND_DATA,
        type: updates.type || BackgroundType.Gradient,
        ...updates
      })
      return
    }

    const currentBg = backgroundEffect.data as BackgroundEffectData

    onEffectChange(EffectType.Background, {
      ...currentBg,
      ...updates
    })
  }, [backgroundEffect, onEffectChange])

  const scheduleBackgroundUpdate = updateBackgroundEffect

  return (
    <TooltipProvider>
      <div ref={tooltipRef} className={cn("flex h-full bg-transparent border-l border-border/40", className)}>
        {/* Left sidebar with section tabs */}
        <div className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 border-r border-border/40 bg-transparent">
          <div className="flex flex-col gap-3 w-full px-2">
            {SIDEBAR_TABS.map((tab) => (
              <Tooltip key={tab.id} delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "group relative flex w-full items-center justify-center p-2.5 rounded-xl transition-all duration-200",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-label={tab.label}
                  >
                    <tab.icon className={cn("w-5 h-5 transition-transform duration-200", activeTab === tab.id ? "scale-100" : "group-hover:scale-110")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" sideOffset={12}>
                  {tab.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0 flex flex-col bg-transparent">
          {/* Header */}
          <div className="h-14 flex items-center px-5 border-b border-border/40 bg-transparent sticky top-0 z-10">
            <h2 className="text-sm font-medium tracking-tight">
              {SIDEBAR_TABS.find(t => t.id === activeTab)?.label}
            </h2>
            {selectedEffectLayer && (
              <div className="ml-auto px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium leading-none rounded-full border border-primary/20">
                {selectedEffectLayer.type === EffectLayerType.Zoom && selectedEffectLayer.id ?
                  `Editing Zoom Block` :
                  (() => {
                    const t = String(selectedEffectLayer.type)
                    return `Editing ${t.charAt(0).toUpperCase() + t.slice(1)}`
                  })()}
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 custom-scrollbar">
            <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {activeTab === SidebarTabId.Background && (
                <BackgroundTab
                  backgroundEffect={backgroundEffect}
                  onUpdateBackground={scheduleBackgroundUpdate}
                />
              )}

              {activeTab === SidebarTabId.Cursor && (
                <CursorTab
                  cursorEffect={cursorEffect}
                  onUpdateCursor={(updates) => updateEffect(EffectType.Cursor, updates)}
                  onEffectChange={onEffectChange}
                />
              )}

              {activeTab === SidebarTabId.Keystroke && (
                <KeystrokeTab
                  keystrokeEffect={keystrokeEffect}
                  onUpdateKeystroke={(updates) => updateEffect(EffectType.Keystroke, updates)}
                  onEffectChange={onEffectChange}
                />
              )}

              {activeTab === SidebarTabId.Zoom && (
                <ZoomTab
                  effects={effects}
                  selectedEffectLayer={selectedEffectLayer}
                  selectedClip={selectedClip}
                  onUpdateZoom={(updates) => onEffectChange(EffectType.Zoom, updates)}
                  onEffectChange={onEffectChange}
                  onZoomBlockUpdate={onZoomBlockUpdate}
                />
              )}

              {activeTab === SidebarTabId.Shape && (
                <ShapeTab
                  backgroundEffect={backgroundEffect}
                  onUpdateBackground={scheduleBackgroundUpdate}
                />
              )}

              {activeTab === SidebarTabId.Screen && (
                <ScreenTab
                  selectedClip={selectedClip}
                  selectedEffectLayer={selectedEffectLayer}
                  onEffectChange={(type, data) => onEffectChange(EffectType.Screen, data)}
                />
              )}

              {activeTab === SidebarTabId.Clip && (
                <ClipTab
                  selectedClip={selectedClip}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
