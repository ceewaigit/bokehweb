'use client'

import React from 'react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { CursorEffectData, Effect } from '@/types/project'
import { EffectType } from '@/types'
import { DEFAULT_CURSOR_DATA } from '@/lib/constants/default-effects'

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
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs">Show Cursor</span>
          <Switch
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
        </label>
      </div>

      {/* Only show cursor settings when enabled */}
      {cursorEffect?.enabled && (
        <div className="space-y-3">
          <div className="p-4 bg-background/40 rounded-xl space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Size</label>
            <Slider
              value={[cursorData?.size ?? DEFAULT_CURSOR_DATA.size]}
              onValueChange={([value]) => onUpdateCursor({ size: value })}
              onValueCommit={([value]) => onUpdateCursor({ size: value })}
              min={0.5}
              max={8}
              step={0.1}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.size ?? DEFAULT_CURSOR_DATA.size).toFixed(1)}x</span>
          </div>

          <div className="p-4 bg-background/40 rounded-xl">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs">Click Animation</span>
              <Switch
                checked={cursorData?.clickEffects ?? DEFAULT_CURSOR_DATA.clickEffects}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ clickEffects: checked })
                }
              />
            </label>
          </div>

          <div className="p-4 bg-background/40 rounded-xl">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs">Smooth Movement</span>
              <Switch
                checked={cursorData?.gliding ?? DEFAULT_CURSOR_DATA.gliding}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ gliding: checked })
                }
              />
            </label>
          </div>

          <div className="p-4 bg-background/40 rounded-xl">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs">Motion Blur</span>
              <Switch
                checked={cursorData?.motionBlur ?? DEFAULT_CURSOR_DATA.motionBlur}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ motionBlur: checked })
                }
              />
            </label>
          </div>

          <div className="p-4 bg-background/40 rounded-xl">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs">Hide When Idle</span>
              <Switch
                checked={cursorData?.hideOnIdle ?? DEFAULT_CURSOR_DATA.hideOnIdle}
                onCheckedChange={(checked) =>
                  onUpdateCursor({ hideOnIdle: checked })
                }
              />
            </label>
          </div>

          {hideOnIdle && (
            <div className="p-4 bg-background/40 rounded-xl space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Idle Timeout</label>
              <Slider
                value={[(cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000]}
                onValueChange={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                onValueCommit={([value]) => onUpdateCursor({ idleTimeout: value * 1000 })}
                min={1}
                max={10}
                step={0.5}
                className="w-full"
              />
              <span className="text-[10px] text-muted-foreground/70 font-mono">{((cursorData?.idleTimeout ?? DEFAULT_CURSOR_DATA.idleTimeout) / 1000).toFixed(1)}s</span>
            </div>
          )}

          {hideOnIdle && (
            <div className="p-4 bg-background/40 rounded-xl">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs">Fade In/Out</span>
                <Switch
                  checked={fadeOnIdle}
                  onCheckedChange={(checked) =>
                    onUpdateCursor({ fadeOnIdle: checked })
                  }
                />
              </label>
            </div>
          )}

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
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.speed ?? DEFAULT_CURSOR_DATA.speed).toFixed(2)}</span>
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
              <span className="text-[10px] text-muted-foreground/70 font-mono">{(cursorData?.smoothness ?? DEFAULT_CURSOR_DATA.smoothness).toFixed(2)}</span>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
