"use client"

import { useState } from 'react'
import { useRecordingStore } from '@/stores/recording-store'
import { useProjectStore } from '@/stores/project-store'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import {
  Settings,
  Layers,
  Palette,
  Volume2,
  Monitor,
  Sliders
} from 'lucide-react'

export function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<'project' | 'clip' | 'effects' | 'audio'>('project')
  const { settings, updateSettings } = useRecordingStore()
  const { currentProject, selectedClips, updateClipEffects } = useProjectStore()

  // Get the first selected clip for editing (multi-select shows first clip's properties)
  const selectedClip = selectedClips.length > 0 && currentProject
    ? currentProject.timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === selectedClips[0])
    : null

  const tabs = [
    { id: 'project', label: 'Project', icon: Monitor },
    { id: 'clip', label: 'Clip', icon: Layers },
    { id: 'effects', label: 'Effects', icon: Palette },
    { id: 'audio', label: 'Audio', icon: Volume2 }
  ] as const

  return (
    <div className="h-full bg-card border-l border-border flex flex-col">
      {/* Tab Header */}
      <div className="h-12 border-b border-border flex">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-1 text-xs font-medium transition-colors ${activeTab === tab.id
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {activeTab === 'effects' && selectedClip && currentProject && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3">Zoom Effects</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Enable Zoom</label>
                  <Switch
                    checked={selectedClip.effects?.zoom?.enabled || false}
                    onCheckedChange={(checked) => {
                      updateClipEffects(selectedClip.id, {
                        zoom: { ...selectedClip.effects?.zoom, enabled: checked }
                      })
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs">Max Zoom</label>
                  <Slider
                    value={[selectedClip.effects?.zoom?.maxZoom || 2]}
                    onValueChange={([value]) => {
                      updateClipEffects(selectedClip.id, {
                        zoom: { ...selectedClip.effects?.zoom, maxZoom: value }
                      })
                    }}
                    min={1}
                    max={4}
                    step={0.1}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-3">Cursor</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs">Show Cursor</label>
                  <Switch
                    checked={selectedClip.effects?.cursor?.visible || false}
                    onCheckedChange={(checked) => {
                      updateClipEffects(selectedClip.id, {
                        cursor: { ...selectedClip.effects?.cursor, visible: checked }
                      })
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs">Cursor Style</label>
                  <Select
                    value={selectedClip.effects?.cursor?.style || 'default'}
                    onValueChange={(value) => {
                      updateClipEffects(selectedClip.id, {
                        cursor: { ...selectedClip.effects?.cursor, style: value as any }
                      })
                    }}
                  >
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="macOS">macOS</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs">Motion Blur</label>
                  <Switch
                    checked={selectedClip.effects?.cursor?.motionBlur || false}
                    onCheckedChange={(checked) => {
                      updateClipEffects(selectedClip.id, {
                        cursor: { ...selectedClip.effects?.cursor, motionBlur: checked }
                      })
                    }}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-3">Background</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs">Background Type</label>
                  <Select
                    value={selectedClip.effects?.background?.type || 'none'}
                    onValueChange={(value) => {
                      updateClipEffects(selectedClip.id, {
                        background: { ...selectedClip.effects?.background, type: value as any }
                      })
                    }}
                  >
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="color">Solid Color</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="blur">Blur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs">Padding</label>
                  <Slider
                    value={[selectedClip.effects?.background?.padding || 0]}
                    onValueChange={([value]) => {
                      updateClipEffects(selectedClip.id, {
                        background: { ...selectedClip.effects?.background, padding: value }
                      })
                    }}
                    min={0}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-3">Video Style</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs">Corner Radius</label>
                  <Slider
                    value={[selectedClip.effects?.video?.cornerRadius || 0]}
                    onValueChange={([value]) => {
                      updateClipEffects(selectedClip.id, {
                        video: { ...selectedClip.effects?.video, cornerRadius: value }
                      })
                    }}
                    min={0}
                    max={30}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs">Drop Shadow</label>
                  <Switch
                    checked={selectedClip.effects?.video?.shadow?.enabled || false}
                    onCheckedChange={(checked) => {
                      updateClipEffects(selectedClip.id, {
                        video: {
                          ...selectedClip.effects?.video,
                          shadow: { ...selectedClip.effects?.video?.shadow, enabled: checked }
                        }
                      })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'project' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Project Settings</h3>
              {currentProject ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Resolution:</span>
                    <span>{currentProject.settings.resolution.width}×{currentProject.settings.resolution.height}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Frame Rate:</span>
                    <span>{currentProject?.settings?.frameRate || 60} fps</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Duration:</span>
                    <span>{currentProject?.timeline?.duration ? (currentProject.timeline.duration / 1000).toFixed(1) : '0.0'}s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Clips:</span>
                    <span>{currentProject?.timeline?.tracks?.[0]?.clips?.length || 0}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No project loaded</p>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Recording Settings</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Capture Area:</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.area}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Audio Input:</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.audioInput}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Quality:</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.quality}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Frame Rate:</span>
                  <span>{settings.framerate || 60} fps</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clip' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Clip Properties</h3>
              {selectedClip ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Clip ID:</span>
                    <span className="truncate ml-2">{selectedClip.id}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Start Time:</span>
                    <span>{(selectedClip.startTime / 1000).toFixed(2)}s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Duration:</span>
                    <span>{(selectedClip.duration / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {selectedClips.length > 1
                    ? `${selectedClips.length} clips selected`
                    : 'No clip selected'
                  }
                </p>
              )}
            </div>

            {selectedClip && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Transform</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="text-xs">
                      Position
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs">
                      Scale
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs">
                      Rotation
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs">
                      Opacity
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Available Effects</h3>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Sliders className="w-3 h-3 mr-2" />
                  Smooth Zoom
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Sliders className="w-3 h-3 mr-2" />
                  Cursor Highlight
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Sliders className="w-3 h-3 mr-2" />
                  Click Animation
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Sliders className="w-3 h-3 mr-2" />
                  Blur Background
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Applied Effects</h3>
              <p className="text-xs text-muted-foreground">
                No effects applied to selected clip
              </p>
            </div>
          </div>
        )}

        {activeTab === 'audio' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Audio Settings</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Master Volume:</span>
                  <span>100%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Sample Rate:</span>
                  <span>48000 Hz</span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Audio Tracks</h3>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Volume2 className="w-3 h-3 mr-2" />
                  System Audio
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs">
                  <Volume2 className="w-3 h-3 mr-2" />
                  Microphone
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}