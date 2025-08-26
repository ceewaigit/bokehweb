'use client'

import { useEffect } from 'react'
import { useGlassmorphismStore } from '@/stores/glassmorphism-store'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Info } from 'lucide-react'

export function GlassmorphismSettings() {
  const { opacity, blurRadius, setOpacity, setBlurRadius, applySettings } = useGlassmorphismStore()

  // Apply settings on mount
  useEffect(() => {
    applySettings()
  }, [])

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Window Transparency</h3>

        {/* Window Opacity */}
        <div className="space-y-2">
          <Label htmlFor="opacity" className="text-sm font-normal">
            Window Opacity: {opacity}%
          </Label>
          <Slider
            id="opacity"
            min={20}
            max={100}
            step={5}
            value={[opacity]}
            onValueChange={([value]) => setOpacity(value)}
            className="w-full"
          />
        </div>

        {/* Info */}
        <div className="mt-4 p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">
            Adjust the window opacity to make the entire application translucent. 
            Lower values make the window more transparent.
          </p>
        </div>
      </div>
    </div>
  )
}