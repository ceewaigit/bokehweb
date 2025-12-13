'use client'

import React from 'react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { CursorEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'
import { InfoTooltip } from './info-tooltip'

interface CursorTabProps {
  cursorEffect: Effect | undefined
  onUpdateCursor: (updates: any) => void
  onEffectChange: (type: EffectType, data: any) => void
}

export function CursorTab({ cursorEffect, onUpdateCursor, onEffectChange }: CursorTabProps) {
  const cursorData = cursorEffect?.data as CursorEffectData | undefined
  const hideOnIdle = cursorData?.hideOnIdle ?? DEFAULT_CURSOR_DATA.hideOnIdle
  const fadeOnIdle = cursorData?.fadeOnIdle ?? DEFAULT_CURSOR_DATA.fadeOnIdle

  return (
    <div className="space-y-4">
      {/* Master cursor visibility toggle */}
      <div className="p-4 bg-background/40 rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-none">Cursor</div>
            <div className="mt-1 text-xs text-muted-foreground leading-snug">
              Show and customize the cursor overlay.
            </div>
          </div>
          <Switch
            aria-label="Show cursor"
            checked={cursorEffect?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (cursorEffect) {
                onEffectChange(EffectType.Cursor, { ...cursorData, enabled: checked })
              } else {
                onEffectChange(EffectType.Cursor, {
                  ...DEFAULT_CURSOR_DATA,
                  enabled: checked
                })
              }
            }}
          />
        </div>
      </div>

      {/* Only show cursor settings when enabled */}
      {cursorEffect?.enabled && (
        <div className="space-y-3">
          <div className="p-4 bg-background/40 rounded-xl space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <label className="text-xs font-medium text-muted-foreground">Size</label>
                <InfoTooltip content="Scales the cursor overlay size." />
              </div>
            </div>
            <Slider
              value={[cursorData?.size ?? DEFAULT_CURSOR_DATA.size]}
              onValueChange={([value]) => onUpdateCursor({ size: value })}
              onValueCommit={([value]) => onUpdateCursor({ size: value })}
              min={0.5}
              max={8}
              step={0.1}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{(cursorData?.size ?? DEFAULT_CURSOR_DATA.size).toFixed(1)}x</span>
          </div>

          <div className="p-3 bg-background/40 rounded-xl">
            <div className="px-1 text-[11px] font-semibold text-muted-foreground/90 uppercase tracking-wider">
              Behavior
            </div>
            <div className="mt-2 divide-y divide-border/20">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm leading-none">Click Animation</div>
                  <InfoTooltip content="Adds a subtle pulse/ripple on mouse clicks." />
                </div>
                <Switch
                  className="scale-90 origin-right"
                  checked={cursorData?.clickEffects ?? DEFAULT_CURSOR_DATA.clickEffects}
                  onCheckedChange={(checked) => onUpdateCursor({ clickEffects: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm leading-none">Smooth Movement</div>
                  <InfoTooltip content="Interpolates mouse movement for smoother cursor motion." />
                </div>
                <Switch
                  className="scale-90 origin-right"
                  checked={cursorData?.gliding ?? DEFAULT_CURSOR_DATA.gliding}
                  onCheckedChange={(checked) => onUpdateCursor({ gliding: checked })}
                />
              </div>

              <div className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm leading-none">Motion Blur</div>
                  <InfoTooltip content="Adds blur to fast cursor movements." />
                </div>
                <Switch
                  className="scale-90 origin-right"
                  checked={cursorData?.motionBlur ?? DEFAULT_CURSOR_DATA.motionBlur}
                  onCheckedChange={(checked) => onUpdateCursor({ motionBlur: checked })}
                />
              </div>

              <div className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm leading-none">Hide When Idle</div>
                    <InfoTooltip content="Hides the cursor after a period of no movement." />
                  </div>
                  <Switch
                    className="scale-90 origin-right"
                    checked={cursorData?.hideOnIdle ?? DEFAULT_CURSOR_DATA.hideOnIdle}
                    onCheckedChange={(checked) => onUpdateCursor({ hideOnIdle: checked })}
                  />
                </div>

                {hideOnIdle && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <label className="text-xs font-medium text-muted-foreground">Idle Timeout</label>
                        <InfoTooltip content="How long to wait before hiding the cursor." />
                      </div>
                      <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">
                        {((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <Slider
                      value={[(cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000]}
                      onValueChange={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                      onValueCommit={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                      min={1}
                      max={10}
                      step={0.5}
                      className="w-full"
                    />

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm leading-none">Fade In/Out</div>
                        <InfoTooltip content="Fades the cursor instead of instantly hiding/showing it." />
                      </div>
                      <Switch
                        className="scale-90 origin-right"
                        checked={fadeOnIdle}
                        onCheckedChange={(checked) => onUpdateCursor({ fadeOnIdle: checked })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Advanced Section */}
          <details className="space-y-2 pt-2">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer">Advanced</summary>
            <div className="p-4 bg-background/40 rounded-xl space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Speed</label>
              <Slider
                value={[cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed]}
                onValueChange={([value]) => onUpdateCursor({ speed: value })}
                min={0.1}
                max={1}
                step={0.05}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{(cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed).toFixed(2)}</span>
            </div>
            <div className="p-4 bg-background/40 rounded-xl space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Smoothness</label>
              <Slider
                value={[cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness]}
                onValueChange={([value]) => onUpdateCursor({ smoothness: value })}
                min={0.1}
                max={1}
                step={0.05}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{(cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness).toFixed(2)}</span>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
