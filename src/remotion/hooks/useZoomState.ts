import { useMemo, useRef } from 'react';
import { EffectType, type Effect, type ZoomBlock, type Recording, type ZoomEffectData } from '@/types/project';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';
import {
    SEEK_THRESHOLD_MS,
    SPRING_TENSION,
    SPRING_FRICTION
} from '@/lib/constants/calculator-constants';

interface UseZoomStateProps {
    /** Timeline effects array - zoom effects are now always in timeline-space */
    effects: Effect[];
    /** Current timeline position in milliseconds (for zoom block matching) */
    timelineMs: number;
    /** Current source time in milliseconds (for mouse event lookup) */
    sourceTimeMs?: number;
    /** Current recording context for mouse events */
    recording?: Recording | null;
}

interface ZoomState {
    activeZoomBlock: ZoomBlock | undefined;
    zoomCenter: { x: number; y: number };
    zoomScale: number;
}

/**
 * Extract zoom data from an effect
 */
function getZoomData(effect: Effect): ZoomEffectData | null {
    if (effect.type !== EffectType.Zoom) return null;
    return effect.data as ZoomEffectData;
}

/**
 * useZoomState - Calculates zoom state based on current timeline position
 * 
 * SIMPLIFIED ARCHITECTURE: All zoom effects are now stored in timeline-space.
 * No more source-space conversion needed - direct lookup by timeline time.
 */
export function useZoomState({ effects, timelineMs, sourceTimeMs, recording }: UseZoomStateProps): ZoomState {
    // Extract zoom blocks from effects - all are already in timeline-space
    const zoomBlocks = useMemo(() => {
        const zoomEffects = effects.filter(e => e.type === EffectType.Zoom && e.enabled);
        return zoomEffects.map(e => {
            const data = getZoomData(e);
            return {
                id: e.id,
                startTime: e.startTime,  // Already timeline-space
                endTime: e.endTime,      // Already timeline-space
                scale: data?.scale ?? 2,
                targetX: data?.targetX,
                targetY: data?.targetY,
                screenWidth: data?.screenWidth,
                screenHeight: data?.screenHeight,
                introMs: data?.introMs ?? 300,
                outroMs: data?.outroMs ?? 300,
            } as ZoomBlock;
        });
    }, [effects]);

    // Find active zoom block at current TIMELINE time
    const activeZoomBlock = useMemo(() => {
        return zoomBlocks.find(
            (block) => timelineMs >= block.startTime && timelineMs <= block.endTime
        );
    }, [zoomBlocks, timelineMs]);

    // Source time for mouse event lookup (fallback to timeline time if not provided)
    const mouseEventTimeMs = sourceTimeMs ?? timelineMs;

    // Physics state for smooth camera movement
    const physicsState = useRef({
        x: 0.5,
        y: 0.5,
        vx: 0,
        vy: 0,
        lastTime: sourceTimeMs
    });

    // Calculate zoom center
    const zoomCenter = useMemo(() => {
        // 1. If active zoom block has explicit target, use it
        if (activeZoomBlock && activeZoomBlock.targetX != null && activeZoomBlock.targetY != null) {
            const screenWidth = activeZoomBlock.screenWidth || recording?.width || 1920;
            const screenHeight = activeZoomBlock.screenHeight || recording?.height || 1080;

            const targetX = activeZoomBlock.targetX / screenWidth;
            const targetY = activeZoomBlock.targetY / screenHeight;

            // Sync physics state to prevent jumping when switching back to mouse follow
            physicsState.current = {
                x: targetX,
                y: targetY,
                vx: 0,
                vy: 0,
                lastTime: sourceTimeMs
            };

            return {
                x: targetX,
                y: targetY,
            };
        }

        // 2. If no active zoom block, follow the mouse cinematically
        const mouseEvents = (recording?.metadata as any)?.mouseEvents || [];
        const screenWidth = recording?.width || 1920;
        const screenHeight = recording?.height || 1080;

        // Use the Attractor logic (Cluster or Mouse) with SOURCE time
        const attractor = zoomPanCalculator.calculateAttractor(
            mouseEvents,
            mouseEventTimeMs,  // Use source time for mouse event lookup
            screenWidth,
            screenHeight
        );

        let targetX = 0.5;
        let targetY = 0.5;

        if (attractor) {
            targetX = attractor.x / screenWidth;
            targetY = attractor.y / screenHeight;
        }

        // Physics Simulation (Spring/Damper)
        const dt = mouseEventTimeMs - (physicsState.current.lastTime ?? mouseEventTimeMs);

        // Detect seeking or large jumps (e.g. > 100ms or negative time)
        const isSeek = Math.abs(dt) > SEEK_THRESHOLD_MS || dt < 0;

        if (isSeek) {
            physicsState.current = {
                x: targetX,
                y: targetY,
                vx: 0,
                vy: 0,
                lastTime: mouseEventTimeMs
            };
        } else {
            // Spring Parameters (Critically Damped-ish)
            const tension = SPRING_TENSION;
            const friction = SPRING_FRICTION;

            // Physics Step (Euler Integration)
            const dtSeconds = dt / 1000;

            // X Axis
            const ax = (targetX - physicsState.current.x) * tension - physicsState.current.vx * friction;
            physicsState.current.vx += ax * dtSeconds;
            physicsState.current.x += physicsState.current.vx * dtSeconds;

            // Y Axis
            const ay = (targetY - physicsState.current.y) * tension - physicsState.current.vy * friction;
            physicsState.current.vy += ay * dtSeconds;
            physicsState.current.y += physicsState.current.vy * dtSeconds;

            physicsState.current.lastTime = mouseEventTimeMs;
        }

        return {
            x: physicsState.current.x,
            y: physicsState.current.y
        };
    }, [activeZoomBlock, recording, mouseEventTimeMs]);

    const zoomScale = activeZoomBlock ? activeZoomBlock.scale : 1;

    return {
        activeZoomBlock,
        zoomCenter,
        zoomScale
    };
}
