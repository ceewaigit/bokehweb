/**
 * Zoom Pan Calculator
 * Handles cinematic camera panning during zoom
 */

import type { MouseEvent } from '@/types/project'
import { interpolateMousePosition } from './mouse-interpolation'
import {
  CAMERA_FOLLOW_STRENGTH,
  CAMERA_SMOOTHING,
  CLUSTER_RADIUS_RATIO,
  MIN_CLUSTER_DURATION_MS,
  CLUSTER_HOLD_BUFFER_MS,
  CINEMATIC_WINDOW_MS,
  CINEMATIC_SAMPLES
} from '@/lib/constants/calculator-constants'

export class ZoomPanCalculator {
  // Cache for pre-calculated clusters to avoid re-processing every frame
  // PERF FIX: Use Map with string key instead of WeakMap with object reference
  // WeakMap doesn't persist across Remotion frame renders since each render gets a new array reference
  private clusterCache = new Map<string, Cluster[]>();

  /**
   * Calculate cinematic pan for zoom - follows mouse directly
   * Centers viewport on mouse position with smooth interpolation
   */
  calculateCinematicZoomPan(
    mouseX: number,
    mouseY: number,
    videoWidth: number,
    videoHeight: number,
    zoomScale: number,
    currentPanX: number = 0,
    currentPanY: number = 0
  ): { x: number; y: number } {
    // Normalize mouse position to 0-1
    const mouseNormX = mouseX / videoWidth;
    const mouseNormY = mouseY / videoHeight;

    // Simple approach: viewport should follow the mouse
    // The viewport center should move towards the mouse position

    // Target viewport center = mouse position (for full following)
    // But we'll soften it a bit for cinematic effect
    const followStrength = CAMERA_FOLLOW_STRENGTH;

    // Blend between center (0.5) and mouse position
    const targetViewportCenterX = 0.5 + (mouseNormX - 0.5) * followStrength;
    const targetViewportCenterY = 0.5 + (mouseNormY - 0.5) * followStrength;

    // Convert viewport center to pan values
    // Pan moves content in opposite direction to viewport
    // If viewport goes right (positive), content pans left (negative)
    const targetPanX = -(targetViewportCenterX - 0.5);
    const targetPanY = -(targetViewportCenterY - 0.5);

    // Smooth interpolation for cinematic movement
    const smoothing = CAMERA_SMOOTHING;
    const newPanX = currentPanX + (targetPanX - currentPanX) * smoothing;
    const newPanY = currentPanY + (targetPanY - currentPanY) * smoothing;

    return {
      x: newPanX,
      y: newPanY
    };
  }

  /**
   * Interpolate mouse position with smooth cubic bezier curves
   */
  interpolateMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } | null {
    return interpolateMousePosition(mouseEvents, timeMs)
  }

  /**
   * Analyze mouse events to find static "Clusters" (dwell points).
   * A cluster is a period where the mouse stays relatively within a small area.
   */
  private analyzeMotionClusters(
    mouseEvents: MouseEvent[],
    videoWidth: number,
    videoHeight: number
  ): Cluster[] {
    // Create a cache key based on event count and dimensions
    // This allows caching to work across Remotion frame renders
    const cacheKey = `${mouseEvents.length}-${videoWidth}-${videoHeight}`;
    if (this.clusterCache.has(cacheKey)) {
      return this.clusterCache.get(cacheKey)!;
    }

    const clusters: Cluster[] = [];
    if (mouseEvents.length === 0) return clusters;

    const screenDiag = Math.sqrt(videoWidth * videoWidth + videoHeight * videoHeight);
    const maxClusterRadius = screenDiag * CLUSTER_RADIUS_RATIO;
    const minClusterDuration = MIN_CLUSTER_DURATION_MS;

    let currentCluster: {
      events: MouseEvent[];
      startTime: number;
      sumX: number;
      sumY: number;
    } | null = null;

    for (const event of mouseEvents) {
      if (!currentCluster) {
        // Start new cluster
        currentCluster = {
          events: [event],
          startTime: event.timestamp,
          sumX: event.x,
          sumY: event.y
        };
        continue;
      }

      // Check if event fits in current cluster
      // We use the centroid of the *current* cluster so far
      const count = currentCluster.events.length;
      const centroidX = currentCluster.sumX / count;
      const centroidY = currentCluster.sumY / count;

      const dist = Math.sqrt(
        Math.pow(event.x - centroidX, 2) +
        Math.pow(event.y - centroidY, 2)
      );

      if (dist <= maxClusterRadius) {
        // Add to cluster
        currentCluster.events.push(event);
        currentCluster.sumX += event.x;
        currentCluster.sumY += event.y;
      } else {
        // Close current cluster
        const duration = currentCluster.events[currentCluster.events.length - 1].timestamp - currentCluster.startTime;

        if (duration >= minClusterDuration) {
          clusters.push({
            startTime: currentCluster.startTime,
            endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
            centroidX: currentCluster.sumX / currentCluster.events.length,
            centroidY: currentCluster.sumY / currentCluster.events.length
          });
        }

        // Start new cluster with this event
        currentCluster = {
          events: [event],
          startTime: event.timestamp,
          sumX: event.x,
          sumY: event.y
        };
      }
    }

    // Close final cluster
    if (currentCluster) {
      const duration = currentCluster.events[currentCluster.events.length - 1].timestamp - currentCluster.startTime;
      if (duration >= minClusterDuration) {
        clusters.push({
          startTime: currentCluster.startTime,
          endTime: currentCluster.events[currentCluster.events.length - 1].timestamp,
          centroidX: currentCluster.sumX / currentCluster.events.length,
          centroidY: currentCluster.sumY / currentCluster.events.length
        });
      }
    }

    this.clusterCache.set(cacheKey, clusters);
    return clusters;
  }

  /**
   * Calculate a "Smart Target" for the camera.
   * 
   * New Logic (Weighted Blending with Clamped Transitions & Cinematic Smoothing):
   * 1. Identify ALL clusters.
   * 2. For each cluster, calculate valid "Transition In" and "Transition Out" windows.
   * 3. Calculate weights based on these clamped windows.
   * 4. Blend Cluster Centroids with *Cinematic Smoothed* Mouse Position.
   * 
   * This prevents "anticipation" and "teleporting".
   */
  /**
   * Calculate the "Attractor" target for the camera.
   * This is the target the camera physics will chase.
   * 
   * Logic:
   * 1. If inside a cluster (or within hold buffer): Target = Cluster Centroid
   * 2. If outside: Target = Mouse Position (Cinematic Smoothed)
   */
  calculateAttractor(
    mouseEvents: MouseEvent[] | undefined,
    timeMs: number,
    videoWidth: number,
    videoHeight: number
  ): { x: number; y: number; isCluster: boolean } | null {
    if (!mouseEvents || mouseEvents.length === 0) return null;

    // 1. Get Clusters
    const clusters = this.analyzeMotionClusters(mouseEvents, videoWidth, videoHeight);

    // 2. Check if we are inside a cluster
    // We add a small "hold" buffer after the cluster ends to prevent snapping out too early
    const holdBuffer = CLUSTER_HOLD_BUFFER_MS;

    const activeCluster = clusters.find(c =>
      timeMs >= c.startTime && timeMs <= (c.endTime + holdBuffer)
    );

    if (activeCluster) {
      return {
        x: activeCluster.centroidX,
        y: activeCluster.centroidY,
        isCluster: true
      };
    }

    // 3. If not in cluster, follow mouse
    const currentMouse = this.getCinematicMousePosition(mouseEvents, timeMs);
    if (currentMouse) {
      return {
        x: currentMouse.x,
        y: currentMouse.y,
        isCluster: false
      };
    }

    return null;
  }

  /**
   * Calculate a "Smart Target" for the camera.
   * @deprecated Use calculateAttractor with physics in useZoomState instead.
   */
  calculateSmartTarget(
    mouseEvents: MouseEvent[] | undefined,
    timeMs: number,
    videoWidth: number,
    videoHeight: number
  ): { x: number; y: number } | null {
    const attractor = this.calculateAttractor(mouseEvents, timeMs, videoWidth, videoHeight);
    if (attractor) {
      return { x: attractor.x, y: attractor.y };
    }
    return null;
  }

  /**
   * Calculate a "Cinematic" mouse position by averaging recent history.
   * This creates a smooth, weighted feel instead of raw snapping.
   */
  private getCinematicMousePosition(
    mouseEvents: MouseEvent[],
    timeMs: number
  ): { x: number; y: number } | null {
    const windowSize = CINEMATIC_WINDOW_MS;
    const samples = CINEMATIC_SAMPLES;

    let sumX = 0;
    let sumY = 0;
    let validSamples = 0;

    for (let i = 0; i < samples; i++) {
      const t = timeMs - (i * (windowSize / samples));
      const pos = this.interpolateMousePosition(mouseEvents, t);
      if (pos) {
        sumX += pos.x;
        sumY += pos.y;
        validSamples++;
      }
    }

    if (validSamples === 0) return null;

    return {
      x: sumX / validSamples,
      y: sumY / validSamples
    };
  }

  // Helper for smooth easing
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

interface Cluster {
  startTime: number;
  endTime: number;
  centroidX: number;
  centroidY: number;
}

export const zoomPanCalculator = new ZoomPanCalculator()
