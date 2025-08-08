"use client"

import type { RecordingSettings } from '@/types'
import type { ElectronAPI } from '@/types/electron'

export interface RecordingSource {
  id: string
  name: string
  type: 'screen' | 'window' | 'tab'
  thumbnail?: string
}

export class StreamManager {
  private stream: MediaStream | null = null

  async getDisplayStream(settings: RecordingSettings, sourceId?: string): Promise<MediaStream> {
    // Use Electron's desktopCapturer for cross-application screen recording
    if (typeof window !== 'undefined' && window.electronAPI?.getDesktopSources) {
      console.log('🖥️ Using Electron desktopCapturer for full system recording')
      
      // Check screen recording permission first
      const electronAPI = window.electronAPI as ElectronAPI
      if (electronAPI.checkScreenRecordingPermission) {
        try {
          const permissionResult = await electronAPI.checkScreenRecordingPermission()
          console.log('🔍 Screen recording permission status:', permissionResult)
          
          if (!permissionResult.granted) {
            throw new Error('Screen recording permission denied. Please enable screen recording in System Preferences > Security & Privacy > Privacy > Screen Recording and restart the app.')
          }
        } catch (permissionError) {
          console.error('❌ Permission check failed:', permissionError)
          throw new Error('Failed to check screen recording permissions. Please enable screen recording in System Preferences and restart the app.')
        }
      }
      
      const sources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      })

      if (sources.length === 0) {
        throw new Error('No screen sources available')
      }

      // Use the first screen source or the specified sourceId
      const source = sourceId ? sources.find(s => s.id === sourceId) : sources.find(s => s.id.startsWith('screen:'))
      const selectedSource = source || sources[0]

      console.log('📺 Using source:', selectedSource.name, selectedSource.id)

      // Create a minimal MediaStream directly from the Electron source
      // This bypasses getUserMedia constraints compatibility issues
      try {
        // Create video constraints that Electron 33.x can handle
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            maxWidth: 4096,
            maxHeight: 4096,
            maxFrameRate: 30
          }
        }

        console.log('🎥 Creating stream with validated constraints:', videoConstraints)
        
        // Use only video for now to avoid audio complications
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints
        } as any)
        
        console.log('✅ Electron screen capture stream created')
        console.log('📺 Stream details:', {
          id: this.stream.id,
          active: this.stream.active,
          videoTracks: this.stream.getVideoTracks().length,
          audioTracks: this.stream.getAudioTracks().length
        })
        
        // Verify the video track is working
        const videoTrack = this.stream.getVideoTracks()[0]
        if (videoTrack) {
          console.log('🎬 Video track:', {
            id: videoTrack.id,
            kind: videoTrack.kind,
            label: videoTrack.label,
            enabled: videoTrack.enabled,
            muted: videoTrack.muted,
            readyState: videoTrack.readyState
          })
        }
        
      } catch (error) {
        console.error('❌ Screen capture failed:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Screen recording failed: ${errorMessage}`)
      }
    } else {
      throw new Error('Electron desktopCapturer not available - this app requires Electron for system-wide screen recording')
    }

    // Handle stream end (user stops sharing)
    this.stream.getVideoTracks()[0].addEventListener('ended', () => {
      this.dispatchStreamEnd()
    })

    return this.stream
  }

  stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
  }

  getStream(): MediaStream | null {
    return this.stream
  }

  isActive(): boolean {
    return this.stream?.active ?? false
  }

  private dispatchStreamEnd(): void {
    window.dispatchEvent(new CustomEvent('stream-ended'))
  }

  static async getAvailableSources(): Promise<RecordingSource[]> {
    try {
      // In Electron, we can get desktop capturer sources
      if (typeof window !== 'undefined' && window.electronAPI) {
        const sources = await window.electronAPI.getDesktopSources?.({
          types: ['screen', 'window']
        })
        return sources?.map((source: any) => ({
          id: source.id,
          name: source.name,
          type: source.id.startsWith('screen') ? 'screen' : 'window' as const,
          thumbnail: source.thumbnail
        })) || []
      }

      // In browser, return default options
      return [
        { id: 'screen:0', name: 'Entire Screen', type: 'screen' },
        { id: 'window:select', name: 'Select Window', type: 'window' }
      ]
    } catch (error) {
      console.error('Failed to get sources:', error)
      return [
        { id: 'screen:0', name: 'Entire Screen', type: 'screen' },
        { id: 'window:select', name: 'Select Window', type: 'window' }
      ]
    }
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
  }
}