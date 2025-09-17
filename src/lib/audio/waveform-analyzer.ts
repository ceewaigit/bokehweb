/**
 * Audio waveform analyzer for extracting real audio data from video files
 */

export interface WaveformData {
  peaks: number[]  // Normalized peak values (0-1)
  duration: number // Duration in ms
  sampleRate: number
}

export class WaveformAnalyzer {
  private static cache = new Map<string, WaveformData>()
  
  /**
   * Analyze audio from a video blob URL and extract waveform data
   */
  static async analyzeAudio(
    blobUrl: string, 
    clipId: string,
    startTime: number = 0,
    duration: number = 0,
    samplesPerSecond: number = 100 // How many samples per second to extract
  ): Promise<WaveformData | null> {
    // Check cache first
    const cacheKey = `${clipId}-${startTime}-${duration}-${samplesPerSecond}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    try {
      // Skip waveform analysis for video-stream:// URLs (can't be fetched via Fetch API)
      if (blobUrl.startsWith('video-stream://')) {
        // Return a flat waveform for now - could implement server-side analysis later
        const numSamples = Math.floor(duration * samplesPerSecond)
        const peaks = new Array(numSamples).fill(0.1)
        const waveformData: WaveformData = {
          peaks,
          duration,
          sampleRate: samplesPerSecond
        }
        this.cache.set(cacheKey, waveformData)
        return waveformData
      }
      
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Fetch the video as array buffer
      const response = await fetch(blobUrl)
      const arrayBuffer = await response.arrayBuffer()
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // Get audio channel data (use first channel for simplicity)
      const channelData = audioBuffer.getChannelData(0)
      const sampleRate = audioBuffer.sampleRate
      
      // Calculate sample window
      const startSample = Math.floor((startTime / 1000) * sampleRate)
      const durationInSeconds = duration > 0 ? duration / 1000 : audioBuffer.duration
      const endSample = Math.min(
        channelData.length,
        startSample + Math.floor(durationInSeconds * sampleRate)
      )
      
      // Calculate how many samples to extract
      const totalSamples = Math.floor(durationInSeconds * samplesPerSecond)
      const samplesPerPeak = Math.floor((endSample - startSample) / totalSamples)
      
      // Extract peaks
      const peaks: number[] = []
      
      for (let i = 0; i < totalSamples; i++) {
        const start = startSample + i * samplesPerPeak
        const end = Math.min(start + samplesPerPeak, endSample)
        
        // Find the peak in this window
        let peak = 0
        for (let j = start; j < end; j++) {
          const absValue = Math.abs(channelData[j])
          if (absValue > peak) {
            peak = absValue
          }
        }
        
        // Normalize to 0-1 range
        peaks.push(Math.min(1, peak))
      }
      
      // Apply smoothing to reduce noise
      const smoothedPeaks = this.smoothWaveform(peaks)
      
      const waveformData: WaveformData = {
        peaks: smoothedPeaks,
        duration: durationInSeconds * 1000,
        sampleRate
      }
      
      // Cache the result
      this.cache.set(cacheKey, waveformData)
      
      // Clean up
      audioContext.close()
      
      return waveformData
      
    } catch (error) {
      console.warn('Failed to analyze audio:', error)
      return null
    }
  }
  
  /**
   * Apply smoothing to waveform peaks to reduce visual noise
   */
  private static smoothWaveform(peaks: number[], windowSize: number = 3): number[] {
    const smoothed: number[] = []
    
    for (let i = 0; i < peaks.length; i++) {
      let sum = 0
      let count = 0
      
      // Average with neighboring samples
      for (let j = Math.max(0, i - windowSize); j <= Math.min(peaks.length - 1, i + windowSize); j++) {
        sum += peaks[j]
        count++
      }
      
      smoothed.push(sum / count)
    }
    
    return smoothed
  }
  
  /**
   * Clear cached waveform data for a specific clip
   */
  static clearCache(clipId?: string) {
    if (clipId) {
      // Remove all cache entries for this clip
      const keys = Array.from(this.cache.keys())
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (key.startsWith(clipId)) {
          this.cache.delete(key)
        }
      }
    } else {
      // Clear all cache
      this.cache.clear()
    }
  }
  
  /**
   * Get waveform peaks for rendering at a specific width
   */
  static resamplePeaks(peaks: number[], targetWidth: number, barWidth: number = 2, barGap: number = 2): number[] {
    // Handle undefined or null peaks
    if (!peaks || !Array.isArray(peaks)) return []
    
    const barCount = Math.floor(targetWidth / (barWidth + barGap))
    const resampled: number[] = []
    
    if (peaks.length === 0) return resampled
    
    const samplesPerBar = peaks.length / barCount
    
    for (let i = 0; i < barCount; i++) {
      const start = Math.floor(i * samplesPerBar)
      const end = Math.floor((i + 1) * samplesPerBar)
      
      // Find the peak in this range
      let peak = 0
      for (let j = start; j < end && j < peaks.length; j++) {
        if (peaks[j] > peak) {
          peak = peaks[j]
        }
      }
      
      resampled.push(peak)
    }
    
    return resampled
  }
}