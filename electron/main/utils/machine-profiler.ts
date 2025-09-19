/**
 * Machine Profiler - Dynamic performance detection for adaptive export optimization
 * Profiles the actual machine capabilities in real-time rather than using static presets
 */

import os from 'os';
import { performance } from 'perf_hooks';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

export interface MachineProfile {
  // Hardware capabilities
  cpuCores: number;
  cpuSpeed: number; // MHz
  totalMemoryGB: number;
  availableMemoryGB: number;
  
  // Performance metrics (measured, not guessed)
  frameProcessingSpeed: number; // ms per frame
  memoryBandwidth: number; // MB/s
  gpuAvailable: boolean;
  gpuMemoryMB?: number;
  
  // System state
  thermalPressure: 'none' | 'light' | 'moderate' | 'heavy';
  memoryPressure: 'none' | 'light' | 'moderate' | 'heavy';
  systemLoad: number; // 0-1 scale
  
  // Capabilities
  supportsHardwareAcceleration: boolean;
  optimalConcurrency: number;
  maxSafeMemoryUsage: number; // MB
}

export interface DynamicExportSettings {
  concurrency: number;
  chunkSizeFrames: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  useGPU: boolean;
  offthreadVideoCacheSizeInBytes: number;
  offthreadVideoThreads: number; // Number of threads for OffthreadVideo processing
  enableAdaptiveOptimization: boolean;
  pauseBetweenChunks: number; // ms
}

export class MachineProfiler {
  private lastProfile: MachineProfile | null = null;
  private profileCache: Map<string, { profile: MachineProfile; timestamp: number }> = new Map();
  private readonly CACHE_DURATION_MS = 60000; // 1 minute cache

  /**
   * Profile the system's actual capabilities through benchmarking
   */
  async profileSystem(videoWidth: number, videoHeight: number): Promise<MachineProfile> {
    const cacheKey = `${videoWidth}x${videoHeight}`;
    const cached = this.profileCache.get(cacheKey);
    
    // Use cached profile if recent
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.profile;
    }

    // Get hardware info
    const cpuCores = os.cpus().length;
    const cpuSpeed = os.cpus()[0]?.speed || 2000;
    const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
    const availableMemoryGB = os.freemem() / (1024 * 1024 * 1024);

    // Measure actual performance with a micro-benchmark
    const frameProcessingSpeed = await this.benchmarkFrameProcessing(videoWidth, videoHeight);
    const memoryBandwidth = await this.benchmarkMemoryBandwidth();
    
    // Check GPU availability
    const gpuInfo = await this.detectGPUCapabilities();
    
    // Assess system pressure
    const thermalPressure = await this.assessThermalPressure();
    const memoryPressure = this.assessMemoryPressure(availableMemoryGB, totalMemoryGB);
    const systemLoad = os.loadavg()[0] / cpuCores; // Normalized load average
    
    // Calculate optimal settings based on measurements
    const optimalConcurrency = this.calculateOptimalConcurrency(
      cpuCores,
      frameProcessingSpeed,
      memoryPressure,
      thermalPressure
    );
    
    const maxSafeMemoryUsage = this.calculateMaxSafeMemory(
      availableMemoryGB,
      memoryPressure,
      videoWidth * videoHeight * 4 // Approximate bytes per frame
    );

    const profile: MachineProfile = {
      cpuCores,
      cpuSpeed,
      totalMemoryGB,
      availableMemoryGB,
      frameProcessingSpeed,
      memoryBandwidth,
      gpuAvailable: gpuInfo.available,
      gpuMemoryMB: gpuInfo.memoryMB,
      thermalPressure,
      memoryPressure,
      systemLoad,
      supportsHardwareAcceleration: gpuInfo.available && frameProcessingSpeed < 100,
      optimalConcurrency,
      maxSafeMemoryUsage
    };

    // Cache the profile
    this.profileCache.set(cacheKey, { profile, timestamp: Date.now() });
    this.lastProfile = profile;
    
    return profile;
  }

  /**
   * Benchmark actual frame processing speed
   */
  private async benchmarkFrameProcessing(width: number, height: number): Promise<number> {
    const testFrames = 5;
    const bufferSize = width * height * 4; // RGBA
    
    const startTime = performance.now();
    
    // Simulate frame processing
    for (let i = 0; i < testFrames; i++) {
      const buffer = Buffer.alloc(bufferSize);
      
      // Simulate some processing (fill with data)
      for (let j = 0; j < bufferSize; j += 4) {
        buffer[j] = (j / 4) % 255;     // R
        buffer[j + 1] = (j / 4) % 255; // G
        buffer[j + 2] = (j / 4) % 255; // B
        buffer[j + 3] = 255;           // A
      }
      
      // Force some CPU work
      const sum = buffer.reduce((a, b) => a + b, 0);
      if (sum < 0) console.log('Never happens'); // Prevent optimization
    }
    
    const elapsed = performance.now() - startTime;
    return elapsed / testFrames;
  }

  /**
   * Benchmark memory bandwidth
   */
  private async benchmarkMemoryBandwidth(): Promise<number> {
    const testSizeMB = 100;
    const iterations = 3;
    const bufferSize = testSizeMB * 1024 * 1024;
    
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const buffer = Buffer.alloc(bufferSize);
      const buffer2 = Buffer.alloc(bufferSize);
      buffer.copy(buffer2);
    }
    
    const elapsed = performance.now() - startTime;
    const totalMB = testSizeMB * iterations * 2; // Read + write
    
    return (totalMB * 1000) / elapsed; // MB/s
  }

  /**
   * Detect GPU capabilities
   */
  private async detectGPUCapabilities(): Promise<{ available: boolean; memoryMB?: number }> {
    const platform = os.platform();
    
    try {
      if (platform === 'darwin') {
        // macOS: Check for Metal support
        const result = await exec('system_profiler SPDisplaysDataType | grep -E "Chipset Model|VRAM"').catch(() => ({ stdout: '' }));
        const hasGPU = result.stdout.includes('Chipset Model') || result.stdout.includes('Apple M');
        
        // Extract VRAM if available
        const vramMatch = result.stdout.match(/VRAM.*?(\d+)/);
        const memoryMB = vramMatch ? parseInt(vramMatch[1]) : undefined;
        
        return { available: hasGPU, memoryMB };
      } else if (platform === 'win32') {
        // Windows: Check for DirectX
        const result = await exec('wmic path win32_VideoController get Name,AdapterRAM').catch(() => ({ stdout: '' }));
        const hasGPU = !result.stdout.includes('Microsoft Basic Display');
        
        // Extract video memory
        const ramMatch = result.stdout.match(/(\d{10,})/); // AdapterRAM in bytes
        const memoryMB = ramMatch ? Math.floor(parseInt(ramMatch[1]) / (1024 * 1024)) : undefined;
        
        return { available: hasGPU, memoryMB };
      } else {
        // Linux: Check for GPU devices
        const result = await exec('lspci | grep -E "VGA|3D"').catch(() => ({ stdout: '' }));
        const hasGPU = result.stdout.length > 0;
        
        return { available: hasGPU };
      }
    } catch {
      return { available: false };
    }
  }

  /**
   * Assess thermal pressure (simplified)
   */
  private async assessThermalPressure(): Promise<'none' | 'light' | 'moderate' | 'heavy'> {
    const platform = os.platform();
    
    try {
      if (platform === 'darwin') {
        // macOS: Use powermetrics if available (requires sudo)
        // Fallback to CPU frequency scaling detection
        const cpus = os.cpus();
        const avgSpeed = cpus.reduce((sum, cpu) => sum + cpu.speed, 0) / cpus.length;
        const maxSpeed = Math.max(...cpus.map(cpu => cpu.speed));
        
        const speedRatio = avgSpeed / maxSpeed;
        
        if (speedRatio > 0.9) return 'none';
        if (speedRatio > 0.7) return 'light';
        if (speedRatio > 0.5) return 'moderate';
        return 'heavy';
      } else if (platform === 'win32') {
        // Windows: Check CPU throttling
        const result = await exec('wmic cpu get CurrentClockSpeed,MaxClockSpeed').catch(() => ({ stdout: '' }));
        const lines = result.stdout.split('\n').filter(line => line.trim());
        
        if (lines.length >= 2) {
          const values = lines[1].trim().split(/\s+/);
          if (values.length >= 2) {
            const current = parseInt(values[0]);
            const max = parseInt(values[1]);
            const ratio = current / max;
            
            if (ratio > 0.9) return 'none';
            if (ratio > 0.7) return 'light';
            if (ratio > 0.5) return 'moderate';
            return 'heavy';
          }
        }
      }
    } catch {
      // Fallback: Use load average as proxy
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const loadRatio = loadAvg / cpuCount;
      
      if (loadRatio < 0.5) return 'none';
      if (loadRatio < 0.7) return 'light';
      if (loadRatio < 0.9) return 'moderate';
      return 'heavy';
    }
    
    return 'none';
  }

  /**
   * Assess memory pressure based on absolute free RAM
   * For video rendering, absolute free RAM matters more than ratios
   */
  private assessMemoryPressure(availableGB: number, totalGB: number): 'none' | 'light' | 'moderate' | 'heavy' {
    // Use absolute free RAM for video rendering workloads
    if (availableGB >= 6) return 'none';
    if (availableGB >= 3) return 'light';
    if (availableGB >= 1.5) return 'moderate';
    return 'heavy';
  }

  /**
   * Calculate optimal concurrency based on actual measurements
   */
  private calculateOptimalConcurrency(
    cpuCores: number,
    frameProcessingSpeed: number,
    memoryPressure: string,
    thermalPressure: string
  ): number {
    // Start with aggressive baseline for multi-core machines
    const baseline = cpuCores >= 8 ? Math.min(cpuCores - 1, 8) : Math.max(4, Math.floor(cpuCores * 0.8));
    let concurrency = baseline;
    
    // Adjust based on frame processing speed
    if (frameProcessingSpeed > 200) {
      // Slow processing: still use decent concurrency
      concurrency = Math.max(4, Math.floor(baseline * 0.6));
    } else if (frameProcessingSpeed > 100) {
      // Moderate processing
      concurrency = Math.max(4, Math.floor(baseline * 0.8));
    }
    
    // Only reduce for truly critical memory pressure
    if (memoryPressure === 'heavy') {
      // Still allow reasonable concurrency even under pressure
      concurrency = Math.max(4, Math.min(6, concurrency));
    } else if (memoryPressure === 'moderate') {
      concurrency = Math.max(4, Math.floor(concurrency * 0.8));
    }
    
    // Adjust for thermal pressure
    if (thermalPressure === 'heavy') {
      concurrency = Math.max(3, Math.min(4, concurrency));
    } else if (thermalPressure === 'moderate') {
      concurrency = Math.max(4, Math.floor(concurrency * 0.8));
    }
    
    // For modern multi-core systems, never go below 4 threads
    const minConcurrency = cpuCores >= 8 ? 4 : Math.min(2, cpuCores - 1);
    return Math.max(minConcurrency, Math.min(concurrency, cpuCores));
  }

  /**
   * Calculate maximum safe memory usage
   */
  private calculateMaxSafeMemory(availableGB: number, pressure: string, bytesPerFrame: number): number {
    let safeRatio = 0.5; // Default: use 50% of available
    
    switch (pressure) {
      case 'none':
        safeRatio = 0.7; // Can use more
        break;
      case 'light':
        safeRatio = 0.5;
        break;
      case 'moderate':
        safeRatio = 0.3;
        break;
      case 'heavy':
        safeRatio = 0.2; // Be very conservative
        break;
    }
    
    const maxMemoryMB = availableGB * 1024 * safeRatio;
    
    // Ensure we can at least cache a reasonable number of frames
    const minFrames = 30; // At least 0.5-1 second of video
    const minMemoryMB = (minFrames * bytesPerFrame) / (1024 * 1024);
    
    return Math.max(minMemoryMB, maxMemoryMB);
  }

  /**
   * Get dynamic export settings based on profile
   */
  getDynamicExportSettings(
    profile: MachineProfile,
    videoWidth: number,
    videoHeight: number,
    targetQuality: 'fast' | 'balanced' | 'quality' = 'balanced'
  ): DynamicExportSettings {
    const pixelCount = videoWidth * videoHeight;
    const is4K = pixelCount > 3840 * 2160 * 0.9; // Allow some variance
    const isHighRes = pixelCount > 1920 * 1080 * 0.9;
    
    // Base settings on actual performance measurements
    let settings: DynamicExportSettings = {
      concurrency: profile.optimalConcurrency,
      chunkSizeFrames: 180, // 3 seconds at 60fps - better balance
      jpegQuality: 80, // Remotion default - optimal balance
      videoBitrate: '10M',
      x264Preset: 'veryfast', // Better speed than 'faster'
      useGPU: profile.supportsHardwareAcceleration,
      offthreadVideoCacheSizeInBytes: 1024 * 1024 * 1024, // 1GB default minimum
      offthreadVideoThreads: 2, // Default 2 threads for video processing
      enableAdaptiveOptimization: true,
      pauseBetweenChunks: 0
    };
    
    // Adjust chunk size based on memory
    const bytesPerFrame = pixelCount * 4;
    const framesPerChunk = Math.floor((profile.maxSafeMemoryUsage * 1024 * 1024) / bytesPerFrame);
    settings.chunkSizeFrames = Math.min(600, Math.max(60, framesPerChunk)); // 1-10 seconds
    
    // Adjust quality based on processing speed and target
    if (profile.frameProcessingSpeed < 50 && targetQuality === 'quality') {
      // Fast machine, high quality requested
      settings.jpegQuality = 85;  // 85 is a good balance, 95 is overkill
      settings.videoBitrate = is4K ? '40M' : '20M';
      settings.x264Preset = 'fast';
    } else if (profile.frameProcessingSpeed < 100) {
      // Good performance
      settings.jpegQuality = 80;  // Remotion default, good balance
      settings.videoBitrate = is4K ? '25M' : isHighRes ? '15M' : '10M';
      settings.x264Preset = 'veryfast';  // Better speed than 'faster'
    } else if (profile.frameProcessingSpeed < 200) {
      // Moderate performance
      settings.jpegQuality = 80;
      settings.videoBitrate = is4K ? '15M' : isHighRes ? '8M' : '5M';
      settings.x264Preset = 'veryfast';
    } else {
      // Slow performance
      settings.jpegQuality = 75;
      settings.videoBitrate = is4K ? '10M' : isHighRes ? '5M' : '3M';
      settings.x264Preset = 'ultrafast';
      // Don't overly restrict concurrency even on slow machines
      settings.concurrency = Math.max(4, Math.min(6, settings.concurrency));
    }
    
    // Adjust cache size based on total memory (more aggressive caching)
    if (profile.totalMemoryGB >= 32) {
      settings.offthreadVideoCacheSizeInBytes = 4 * 1024 * 1024 * 1024; // 4GB
    } else if (profile.totalMemoryGB >= 16) {
      settings.offthreadVideoCacheSizeInBytes = 2 * 1024 * 1024 * 1024; // 2GB for 16GB systems
    } else if (profile.totalMemoryGB >= 8) {
      settings.offthreadVideoCacheSizeInBytes = 1024 * 1024 * 1024; // 1GB
    } else {
      settings.offthreadVideoCacheSizeInBytes = 512 * 1024 * 1024; // 512MB minimum
    }
    
    // Add pauses for thermal management
    if (profile.thermalPressure === 'heavy') {
      settings.pauseBetweenChunks = 2000; // 2 second pause
    } else if (profile.thermalPressure === 'moderate') {
      settings.pauseBetweenChunks = 500; // 0.5 second pause
    }
    
    // Disable GPU if thermal pressure is high
    if (profile.thermalPressure === 'heavy' || profile.thermalPressure === 'moderate') {
      settings.useGPU = false;
    }
    
    // Override for target quality preference
    if (targetQuality === 'fast') {
      settings.x264Preset = 'ultrafast';
      settings.jpegQuality = Math.min(70, settings.jpegQuality);
      settings.concurrency = Math.min(profile.cpuCores - 1, settings.concurrency + 2);
    } else if (targetQuality === 'quality') {
      settings.jpegQuality = Math.max(90, settings.jpegQuality);
      settings.concurrency = Math.max(2, settings.concurrency - 1);
    }
    
    return settings;
  }

  /**
   * Monitor and adapt settings during export
   */
  async adaptSettingsDuringExport(
    currentSettings: DynamicExportSettings,
    frameRenderTimes: number[],
    memoryUsage: number
  ): Promise<DynamicExportSettings> {
    const adapted = { ...currentSettings };
    
    // Calculate average frame time from recent samples
    const recentFrames = frameRenderTimes.slice(-30); // Last 30 frames
    const avgFrameTime = recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length;
    
    // Check if we're falling behind
    const targetFrameTime = 100; // Target: 100ms per frame max
    
    if (avgFrameTime > targetFrameTime * 2) {
      // Way too slow: drastically reduce load
      adapted.concurrency = Math.max(1, Math.floor(adapted.concurrency / 2));
      adapted.chunkSizeFrames = Math.max(30, Math.floor(adapted.chunkSizeFrames / 2));
      adapted.pauseBetweenChunks = Math.max(1000, adapted.pauseBetweenChunks);
    } else if (avgFrameTime > targetFrameTime * 1.5) {
      // Too slow: reduce load
      adapted.concurrency = Math.max(1, adapted.concurrency - 1);
      adapted.pauseBetweenChunks = Math.max(500, adapted.pauseBetweenChunks);
    } else if (avgFrameTime < targetFrameTime * 0.5 && memoryUsage < 0.7) {
      // Fast and memory available: can increase load
      const cpuCores = os.cpus().length;
      adapted.concurrency = Math.min(cpuCores - 1, adapted.concurrency + 1);
      adapted.pauseBetweenChunks = Math.max(0, adapted.pauseBetweenChunks - 200);
    }
    
    // Check memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryPressure = 1 - (freeMemory / totalMemory);
    
    if (memoryPressure > 0.9) {
      // Critical memory pressure
      adapted.chunkSizeFrames = Math.max(30, Math.floor(adapted.chunkSizeFrames / 2));
      adapted.offthreadVideoCacheSizeInBytes = Math.min(64 * 1024 * 1024, adapted.offthreadVideoCacheSizeInBytes / 2);
    } else if (memoryPressure > 0.8) {
      // High memory pressure
      adapted.chunkSizeFrames = Math.max(60, Math.floor(adapted.chunkSizeFrames * 0.7));
    }
    
    return adapted;
  }

  /**
   * Get quick performance estimate without full profiling
   */
  async getQuickEstimate(): Promise<'low' | 'medium' | 'high'> {
    const cpuCores = os.cpus().length;
    const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
    const cpuSpeed = os.cpus()[0]?.speed || 2000;
    
    // Simple heuristic
    const score = (cpuCores * cpuSpeed / 1000) + (totalMemoryGB * 100);
    
    if (score > 5000) return 'high';
    if (score > 2000) return 'medium';
    return 'low';
  }
}

// Export singleton instance
export const machineProfiler = new MachineProfiler();