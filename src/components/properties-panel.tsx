"use client"

import { useState } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'
import { useRecordingStore } from '@/stores/recording-store'
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
  const { project, selectedClips } = useTimelineStore()
  const { settings, updateSettings } = useRecordingStore()

  const selectedClip = project?.clips.find(clip => selectedClips.includes(clip.id))

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
        {activeTab === 'project' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Project Settings</h3>
              {project ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Resolution:</span>
                    <span>{project.settings.resolution.width}×{project.settings.resolution.height}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Frame Rate:</span>
                    <span>{project.settings.framerate} fps</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Duration:</span>
                    <span>{project.settings.duration.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Clips:</span>
                    <span>{project.clips.length}</span>
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
                  <span>{settings.framerate} fps</span>
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
                    <span>Name:</span>
                    <span className="truncate ml-2">{selectedClip.name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Type:</span>
                    <Badge variant="outline" className="text-xs">
                      {selectedClip.type}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Start Time:</span>
                    <span>{selectedClip.startTime.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Duration:</span>
                    <span>{selectedClip.duration.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Track:</span>
                    <span>{selectedClip.trackIndex + 1}</span>
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
                  <span>{project?.settings.audioSampleRate || 48000} Hz</span>
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