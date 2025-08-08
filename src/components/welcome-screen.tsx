"use client"

import { useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import {
  Monitor,
  Play,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  Settings
} from 'lucide-react'

interface WelcomeScreenProps {
  onStartRecording: () => void
  onOpenProject: () => void
  onOpenSettings?: () => void
}

export function WelcomeScreen({ onStartRecording, onOpenProject, onOpenSettings }: WelcomeScreenProps) {
  const features = [
    {
      icon: Monitor,
      title: "High-Quality Recording",
      description: "Capture your screen in up to 4K resolution at 60fps"
    },
    {
      icon: Sparkles,
      title: "Smooth Animations",
      description: "AI-powered zoom effects and cursor highlighting"
    },
    {
      icon: Zap,
      title: "Fast Export",
      description: "Hardware-accelerated encoding for lightning-fast exports"
    },
    {
      icon: Target,
      title: "Precision Editing",
      description: "Frame-accurate timeline with professional tools"
    }
  ]

  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/5">
      <div className="max-w-2xl mx-auto px-8 text-center">
        <div className="mb-16">
          <div className="mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Professional Screen Recording
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Create high-quality screen recordings with professional editing tools and instant export.
            </p>
          </div>

          <div className="flex items-center justify-center space-x-3 mb-12 no-drag">
            <Button onClick={onStartRecording} size="lg" className="group h-12 px-8">
              <Monitor className="w-5 h-5 mr-2" />
              Start Recording
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button onClick={onOpenProject} variant="outline" size="lg" className="h-12 px-6">
              <Play className="w-5 h-5 mr-2" />
              Open Project
            </Button>
            {onOpenSettings && (
              <Button onClick={onOpenSettings} variant="outline" size="lg" className="h-12 px-3">
                <Settings className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Minimal Feature Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="group p-4 bg-card/50 border border-border/50 rounded-lg hover:bg-card transition-colors">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <Monitor className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-medium text-sm mb-1">4K Recording</h3>
            <p className="text-xs text-muted-foreground">Ultra high-quality capture</p>
          </div>

          <div className="group p-4 bg-card/50 border border-border/50 rounded-lg hover:bg-card transition-colors">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-medium text-sm mb-1">Instant Export</h3>
            <p className="text-xs text-muted-foreground">Lightning-fast processing</p>
          </div>
        </div>

        {/* Version Badge */}
        <div>
          <Badge variant="outline" className="text-xs opacity-60">
            v1.0.0 Pro
          </Badge>
        </div>
      </div>
    </div>
  )
}