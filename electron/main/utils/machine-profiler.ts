/**
 * Machine Profiler
 * Returns conservative, stable settings without complex benchmarking
 */

import os from 'os';

export interface MachineProfile {
  cpuCores: number;
  totalMemoryGB: number;
  availableMemoryGB: number;
  gpuAvailable: boolean;
  memoryPressure: string;
  thermalPressure: string;
}

export interface DynamicExportSettings {
  concurrency: number;
  jpegQuality: number;
  videoBitrate: string;
  x264Preset: string;
  useGPU: boolean;
  offthreadVideoCacheSizeInBytes: number;
  enableAdaptiveOptimization: boolean;
}

export class MachineProfiler {
  /**
   * Get basic system info without complex benchmarking
   */
  async profileSystem(videoWidth: number, videoHeight: number): Promise<MachineProfile> {
    const cpuCores = os.cpus().length;
    const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
    const availableMemoryGB = os.freemem() / (1024 * 1024 * 1024);
    
    // Simple GPU detection - assume available on modern systems
    const gpuAvailable = process.platform === 'darwin' || process.platform === 'win32';
    
    return {
      cpuCores,
      totalMemoryGB,
      availableMemoryGB,
      gpuAvailable,
      memoryPressure: 'normal',
      thermalPressure: 'normal'
    };
  }

  /**
   * Get export settings based on quality preference
   * No complex adaptive optimization - just stable, predictable settings
   */
  getDynamicExportSettings(
    profile: MachineProfile,
    videoWidth: number,
    videoHeight: number,
    quality: 'fast' | 'balanced' | 'quality'
  ): DynamicExportSettings {
    // Always use conservative settings for stability
    const cpuCores = Math.max(1, profile.cpuCores || 1);
    const rawAvailable = profile.availableMemoryGB ?? 0;
    const totalMemory = profile.totalMemoryGB || 4;
    const effectiveMemory = Math.max(rawAvailable, totalMemory * 0.3);

    const cpuBasedConcurrency = Math.max(1, Math.floor(cpuCores / 2));
    const memoryBasedConcurrency = Math.max(1, Math.floor(effectiveMemory / 1.5));
    const baseConcurrency = Math.max(1, Math.min(cpuBasedConcurrency, memoryBasedConcurrency, 6));

    const settings: DynamicExportSettings = {
      concurrency: baseConcurrency,
      jpegQuality: 80, // Good quality with better performance
      videoBitrate: '8M', // Balanced bitrate
      x264Preset: 'veryfast', // Prioritize speed over compression
      useGPU: profile.gpuAvailable,
      offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024, // 128MB for better caching
      enableAdaptiveOptimization: false
    };
    
    // Adjust based on quality preference
    switch (quality) {
      case 'quality':
        settings.jpegQuality = 90; // High quality
        settings.videoBitrate = '12M'; // High bitrate
        settings.x264Preset = 'fast'; // Good balance
        settings.offthreadVideoCacheSizeInBytes = 256 * 1024 * 1024; // 256MB for quality mode
        break;
      
      case 'fast':
        settings.jpegQuality = 70; // Lower quality for speed
        settings.videoBitrate = '5M'; // Lower bitrate for speed
        settings.x264Preset = 'ultrafast'; // Maximum speed
        settings.concurrency = Math.min(settings.concurrency, 3); // Limit concurrency for stability
        settings.offthreadVideoCacheSizeInBytes = 64 * 1024 * 1024; // 64MB for fast mode
        break;

      case 'balanced':
      default:
        // Use defaults
        break;
    }
    
    // Adjust for 4K
    if (videoWidth >= 3840) {
      settings.videoBitrate = quality === 'quality' ? '20M' : '15M';
    }
    
    return settings;
  }
}

// Export singleton instance
export const machineProfiler = new MachineProfiler();
