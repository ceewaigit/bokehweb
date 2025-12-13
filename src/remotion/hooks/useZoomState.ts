import { useMemo, useRef } from 'react';
import { type Effect, type Recording } from '@/types/project';
import { computeCameraState, type CameraPhysicsState, type ParsedZoomBlock } from '@/lib/effects/utils/camera-calculator';

interface UseZoomStateProps {
    /** Timeline effects array - zoom effects are now always in timeline-space */
    effects: Effect[];
    /** Current timeline position in milliseconds (for zoom block matching) */
    timelineMs: number;
    /** Current source time in milliseconds (for mouse event lookup) */
    sourceTimeMs?: number;
    /** Current recording context for mouse events */
    recording?: Recording | null;
    /** Output/composition size for aspect-aware camera bounds */
    outputWidth?: number;
    outputHeight?: number;
    /** Overscan bounds to allow panning into preview padding/background. */
    overscan?: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    /** When true, compute camera without spring state (export-safe). */
    deterministic?: boolean;
}

interface ZoomState {
    activeZoomBlock: ParsedZoomBlock | undefined;
    zoomCenter: { x: number; y: number };
    zoomScale: number;
}

/**
 * useZoomState - Calculates zoom state based on current timeline position
 *
 * SIMPLIFIED ARCHITECTURE: All zoom effects are now stored in timeline-space.
 * No more source-space conversion needed - direct lookup by timeline time.
 */
export function useZoomState({
    effects,
    timelineMs,
    sourceTimeMs,
    recording,
    outputWidth,
    outputHeight,
    overscan,
    deterministic,
}: UseZoomStateProps): ZoomState {
    // Source time for mouse event lookup (fallback to timeline time if not provided)
    const mouseEventTimeMs = sourceTimeMs ?? timelineMs;

    // Physics state for smooth camera movement - persists across renders
    const physicsState = useRef<CameraPhysicsState>({
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        lastTimeMs: timelineMs,
        lastSourceTimeMs: mouseEventTimeMs,
    });

    // Compute camera state per frame using spring physics (same path for preview/export)
    const cameraState = useMemo(() => {
        const computed = computeCameraState({
            effects,
            timelineMs,
            sourceTimeMs: mouseEventTimeMs,
            recording,
            outputWidth,
            outputHeight,
            overscan,
            physics: physicsState.current,
            deterministic: deterministic ?? false,
        });
        physicsState.current = computed.physics;

        return computed;
    }, [effects, timelineMs, mouseEventTimeMs, recording, outputWidth, outputHeight, overscan, deterministic]);

    return {
        activeZoomBlock: cameraState.activeZoomBlock,
        zoomCenter: cameraState.zoomCenter,
        zoomScale: cameraState.zoomScale,
    };
}
