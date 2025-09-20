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
    const settings: DynamicExportSettings = {
      concurrency: 1, // Single frame at a time
      jpegQuality: 80,
      videoBitrate: '8M',
      x264Preset: 'veryfast',
      useGPU: profile.gpuAvailable,
      offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024, // 64MB
      enableAdaptiveOptimization: false
    };
    
    // Adjust based on quality preference
    switch (quality) {
      case 'quality':
        settings.jpegQuality = 90;
        settings.videoBitrate = '12M';
        settings.x264Preset = 'medium';
        break;
      
      case 'fast':
        settings.jpegQuality = 70;
        settings.videoBitrate = '5M';
        settings.x264Preset = 'ultrafast';
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