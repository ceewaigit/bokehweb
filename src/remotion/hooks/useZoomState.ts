import { useMemo, useRef } from 'react';
import { EffectType, type Effect, type ZoomBlock, type Recording } from '@/types/project';
import { EffectsFactory } from '@/lib/effects/effects-factory';
import { zoomPanCalculator } from '@/lib/effects/utils/zoom-pan-calculator';

interface UseZoomStateProps {
    effects: Effect[];
    sourceTimeMs: number;
    recording?: Recording | null;
}

interface ZoomState {
    activeZoomBlock: ZoomBlock | undefined;
    zoomCenter: { x: number; y: number };
    zoomScale: number;
}

export function useZoomState({ effects, sourceTimeMs, recording }: UseZoomStateProps): ZoomState {
    // Extract zoom blocks from effects
    const zoomBlocks = useMemo(() => {
        const zoomEffects = effects.filter(e => e.type === EffectType.Zoom && e.enabled);
        return zoomEffects.flatMap(e => {
            const data = EffectsFactory.getZoomData(e);
            return {
                id: e.id,
                startTime: e.startTime,
                endTime: e.endTime,
                scale: data?.scale || 2,
                targetX: data?.targetX,
                targetY: data?.targetY,
                screenWidth: data?.screenWidth,
                screenHeight: data?.screenHeight,
                introMs: data?.introMs || 300,
                outroMs: data?.outroMs || 300,
            };
        });
    }, [effects]);

    // Find active zoom block using SOURCE time
    const activeZoomBlock = useMemo(() => {
        return zoomBlocks.find(
            (block) => sourceTimeMs >= block.startTime && sourceTimeMs <= block.endTime
        );
    }, [zoomBlocks, sourceTimeMs]);

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

        // Use the new Attractor logic (Cluster or Mouse)
        const attractor = zoomPanCalculator.calculateAttractor(
            mouseEvents,
            sourceTimeMs,
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
        const dt = sourceTimeMs - physicsState.current.lastTime;

        // Detect seeking or large jumps (e.g. > 100ms or negative time)
        // If seeking, we snap to the target to avoid wild physics artifacts
        const isSeek = Math.abs(dt) > 100 || dt < 0;

        if (isSeek) {
            physicsState.current = {
                x: targetX,
                y: targetY,
                vx: 0,
                vy: 0,
                lastTime: sourceTimeMs
            };
        } else {
            // Spring Parameters (Critically Damped-ish)
            // Tension: Speed of response (higher = faster)
            // Friction: Damping (higher = less oscillation)
            const tension = 120;
            const friction = 25;

            // Physics Step (Euler Integration)
            // Force = (Target - Current) * Tension - Velocity * Friction
            // Acceleration = Force (assuming mass = 1)

            const dtSeconds = dt / 1000;

            // X Axis
            const ax = (targetX - physicsState.current.x) * tension - physicsState.current.vx * friction;
            physicsState.current.vx += ax * dtSeconds;
            physicsState.current.x += physicsState.current.vx * dtSeconds;

            // Y Axis
            const ay = (targetY - physicsState.current.y) * tension - physicsState.current.vy * friction;
            physicsState.current.vy += ay * dtSeconds;
            physicsState.current.y += physicsState.current.vy * dtSeconds;

            physicsState.current.lastTime = sourceTimeMs;
        }

        return {
            x: physicsState.current.x,
            y: physicsState.current.y
        };
    }, [activeZoomBlock, recording, sourceTimeMs]);

    const zoomScale = activeZoomBlock ? activeZoomBlock.scale : 1;

    return {
        activeZoomBlock,
        zoomCenter,
        zoomScale
    };
}
