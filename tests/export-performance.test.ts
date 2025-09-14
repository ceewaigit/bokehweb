#!/usr/bin/env npx tsx
/**
 * Export Performance Test
 * Measures and reports export performance metrics
 */

import { WebCodecsExportEngine } from '../src/lib/export/webcodecs-export-engine'
import { ExportFormat, QualityLevel, type ExportSettings, type TimelineSegment } from '../src/types'
import { performanceMonitor } from '../src/lib/export/performance-monitor'

// Mock data for testing
const mockSettings: ExportSettings = {
  format: ExportFormat.WEBM,
  quality: QualityLevel.High,
  resolution: { width: 1920, height: 1080 },
  framerate: 30,
  bitrate: 5000000
}

const mockSegment: TimelineSegment = {
  id: 'test-segment',
  startTime: 0,
  endTime: 5000, // 5 seconds
  clips: [],
  effects: []
}

async function runPerformanceTest() {
  console.log('🚀 Export Performance Test')
  console.log('=' .repeat(50))
  
  const engine = new WebCodecsExportEngine()
  
  // Start monitoring
  performanceMonitor.start()
  
  const startTime = performance.now()
  
  try {
    // Run export with mock data
    await engine.export(
      [mockSegment],
      new Map(),
      new Map(),
      mockSettings,
      (progress) => {
        if (progress.currentFrame && progress.currentFrame % 30 === 0) {
          const elapsed = performance.now() - startTime
          const fps = progress.currentFrame / (elapsed / 1000)
          console.log(`Frame ${progress.currentFrame}: ${fps.toFixed(1)} fps avg`)
        }
      }
    )
    
    const totalTime = performance.now() - startTime
    const stats = performanceMonitor.getStats()
    
    console.log('\n📊 Performance Results:')
    console.log('=' .repeat(50))
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`)
    console.log(`Average FPS: ${stats.avgFps.toFixed(1)}`)
    console.log(`Min FPS: ${stats.minFps.toFixed(1)}`)
    console.log(`Max FPS: ${stats.maxFps.toFixed(1)}`)
    console.log(`Average Frame Time: ${stats.avgFrameTime.toFixed(1)}ms`)
    console.log(`P95 Frame Time: ${stats.p95FrameTime.toFixed(1)}ms`)
    console.log(`P99 Frame Time: ${stats.p99FrameTime.toFixed(1)}ms`)
    
    // System metrics
    const cores = navigator.hardwareConcurrency || 4
    const memory = (performance as any).memory?.jsHeapSizeLimit || 0
    const memoryGB = memory / 1024 / 1024 / 1024
    
    console.log('\n💻 System Info:')
    console.log(`CPU Cores: ${cores}`)
    console.log(`Memory: ${memoryGB.toFixed(1)}GB`)
    console.log(`GPU Acceleration: ${stats.gpuAccelerated ? '✅' : '❌'}`)
    console.log(`WebGL Enabled: ${stats.webglEnabled ? '✅' : '❌'}`)
    console.log(`Workers Enabled: ${stats.workersEnabled ? '✅' : '❌'}`)
    
    // Performance grade
    let grade = 'F'
    if (stats.avgFps >= 100) grade = 'A+'
    else if (stats.avgFps >= 80) grade = 'A'
    else if (stats.avgFps >= 60) grade = 'B'
    else if (stats.avgFps >= 40) grade = 'C'
    else if (stats.avgFps >= 20) grade = 'D'
    
    console.log(`\n🎯 Performance Grade: ${grade}`)
    
    if (stats.avgFps < 60) {
      console.log('\n⚠️  Performance Issues Detected:')
      if (!stats.gpuAccelerated) {
        console.log('  - GPU acceleration not available')
      }
      if (!stats.webglEnabled) {
        console.log('  - WebGL not enabled')
      }
      if (stats.avgFrameTime > 50) {
        console.log('  - High frame processing time')
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    performanceMonitor.stop()
  }
}

// Run the test
if (require.main === module) {
  runPerformanceTest().catch(console.error)
}