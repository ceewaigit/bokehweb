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
        <h3 className="text-lg font-semibold">Window</h3>

        {/* Window Opacity */}
        <div className="space-y-2">
          <Label htmlFor="opacity" className="text-sm font-normal">
            Window Opacity: {opacity}
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

        {/* Window Blur */}
        <div className="space-y-2">
          <Label htmlFor="blur" className="text-sm font-normal flex items-center gap-2">
            Window Blur Radius: {blurRadius}
            <Info className="w-4 h-4 text-muted-foreground" />
          </Label>
          <Slider
            id="blur"
            min={0}
            max={30}
            step={2}
            value={[blurRadius]}
            onValueChange={([value]) => setBlurRadius(value)}
            className="w-full"
          />
        </div>

        {/* Preview */}
        <div className="mt-6 p-4 rounded-lg glassmorphism">
          <p className="text-sm font-medium">Preview</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adjust the sliders to see changes in real-time.
          </p>
        </div>
      </div>
    </div>
  )
}