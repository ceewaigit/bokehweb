"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

const DEFAULT_CURSOR_SIZE = { width: 80, height: 80 };

type CursorState = {
    image: string;
    hotspot: { x: number; y: number };
};

// Hotspot = the "click point" of the cursor relative to the image center
// For 80x80 images: tip at top-left would be around x:4-8, y:4-8
const cursorStates = {
    default: {
        image: "/features/cursors/arrowS.png",
        hotspot: { x: 6, y: 4 }, // Arrow tip at top-left corner
    },
    pointer: {
        image: "/features/cursors/linkS.png",
        hotspot: { x: 8, y: 6 }, // Finger tip at top
    },
    text: {
        image: "/features/cursors/beamS.png",
        hotspot: { x: 40, y: 40 }, // I-beam centered
    },
    move: {
        image: "/features/cursors/moveS.png",
        hotspot: { x: 40, y: 40 }, // Move cross centered
    },
    crosshair: {
        image: "/features/cursors/crossS.png",
        hotspot: { x: 40, y: 40 }, // Crosshair centered
    },
    notAllowed: {
        image: "/features/cursors/noS.png",
        hotspot: { x: 40, y: 40 }, // Circle centered
    },
    help: {
        image: "/features/cursors/helpS.png",
        hotspot: { x: 6, y: 4 }, // Arrow tip at top-left
    },
    ewResize: {
        image: "/features/cursors/HsizeS.png",
        hotspot: { x: 40, y: 40 }, // Resize arrow centered
    },
    nsResize: {
        image: "/features/cursors/VsizeS.png",
        hotspot: { x: 40, y: 40 }, // Resize arrow centered
    },
    neswResize: {
        image: "/features/cursors/D2sizeS.png",
        hotspot: { x: 40, y: 40 }, // Resize arrow centered
    },
    nwseResize: {
        image: "/features/cursors/D1sizeS.png",
        hotspot: { x: 40, y: 40 }, // Resize arrow centered
    },
};

type CursorStateMap = {
    [K in keyof typeof cursorStates]: CursorState;
};

type CustomCursorMotion = {
    response?: number;
    followMin?: number;
    followMax?: number;
    rotationMax?: number;
    idleThreshold?: number;
    idleTimeout?: number;
    pressedScale?: number;
};

type CustomCursorProps = {
    size?: { width: number; height: number };
    states?: Partial<CursorStateMap>;
    motion?: CustomCursorMotion;
};

const buildCursorMap = (states: CursorStateMap): Record<string, CursorState> => ({
    auto: states.default,
    default: states.default,
    pointer: states.pointer,
    text: states.text,
    move: states.move,
    grab: states.move,
    grabbing: states.move,
    crosshair: states.crosshair,
    "not-allowed": states.notAllowed,
    "no-drop": states.notAllowed,
    help: states.help,
    "ew-resize": states.ewResize,
    "ns-resize": states.nsResize,
    "nesw-resize": states.neswResize,
    "nwse-resize": states.nwseResize,
});

export function CustomCursor({ size, states, motion }: CustomCursorProps) {
    const cursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const cursorEl = cursorRef.current;
        if (!cursorEl || typeof window === "undefined") return;

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const finePointer = window.matchMedia("(pointer: fine)");

        // Exit early on mobile/touch devices or reduced motion preference
        if (prefersReducedMotion.matches || !finePointer.matches) return;

        document.body.classList.add("custom-cursor-active");

        const resolvedStates = { ...cursorStates, ...states } as CursorStateMap;
        const cursorMap: Record<string, CursorState> = buildCursorMap(resolvedStates);
        const motionConfig = {
            response: motion?.response ?? 1,
            followMin: motion?.followMin ?? 0.55,
            followMax: motion?.followMax ?? 0.92,
            rotationMax: motion?.rotationMax ?? 12,
            idleThreshold: motion?.idleThreshold ?? 0.45,
            idleTimeout: motion?.idleTimeout ?? 110,
            pressedScale: motion?.pressedScale,
        };

        const pressedScaleValue = Number.parseFloat(
            window.getComputedStyle(cursorEl).getPropertyValue("--cursor-pressed-scale"),
        );
        const pressedScale = motionConfig.pressedScale ?? (Number.isFinite(pressedScaleValue) ? pressedScaleValue : 0.8);

        let rafId = 0;
        let isVisible = false;
        let isPressed = false;
        let isIdle = false;
        let activeState = cursorStates.default;
        const current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const target = { x: current.x, y: current.y };
        const lastTarget = { x: target.x, y: target.y };
        const rotation = { current: 0 };
        const scale = { current: 1 };
        let lastMoveAt = performance.now();
        let lastFrameAt = performance.now();
        const IDLE_THRESHOLD = motionConfig.idleThreshold;
        const IDLE_TIMEOUT = motionConfig.idleTimeout;

        const setVisibility = (nextVisible: boolean) => {
            if (isVisible === nextVisible) return;
            isVisible = nextVisible;
            cursorEl.classList.toggle("is-hidden", !nextVisible);
            cursorEl.classList.toggle("is-active", nextVisible);
        };

        const updatePosition = () => {
            const frameNow = performance.now();
            const frameDelta = Math.min(32, frameNow - lastFrameAt);
            lastFrameAt = frameNow;

            const dx = target.x - current.x;
            const dy = target.y - current.y;
            const distance = Math.hypot(dx, dy);
            const vX = target.x - lastTarget.x;
            const vY = target.y - lastTarget.y;
            const speed = Math.hypot(vX, vY);
            lastTarget.x = target.x;
            lastTarget.y = target.y;

            // Check if we've essentially converged (idle detection)
            if (distance < IDLE_THRESHOLD && speed < 0.1 && !isPressed && frameNow - lastMoveAt > IDLE_TIMEOUT) {
                isIdle = true;
                // Final position update before going idle
                current.x = target.x;
                current.y = target.y;
                cursorEl.style.setProperty("--cursor-x", `${current.x - activeState.hotspot.x}px`);
                cursorEl.style.setProperty("--cursor-y", `${current.y - activeState.hotspot.y}px`);
                cursorEl.style.setProperty("--cursor-scale", "1");
                cursorEl.style.setProperty("--cursor-rotate", "0deg");
                // Don't schedule another frame - we're idle
                return;
            }

            const baseFollow = 1 - Math.pow(0.001, (frameDelta / 16) * motionConfig.response);
            const follow = Math.min(
                motionConfig.followMax,
                Math.max(motionConfig.followMin, baseFollow + distance / 1200),
            );
            current.x += dx * follow;
            current.y += dy * follow;

            const drawX = current.x - activeState.hotspot.x;
            const drawY = current.y - activeState.hotspot.y;
            const isMoving = speed > 0.2 && frameNow - lastMoveAt < 140;
            const angle = Math.atan2(vY, vX);
            const tiltStrength = Math.min(1, speed / 14);
            const rotationTarget = isMoving
                ? Math.max(-motionConfig.rotationMax, Math.min(motionConfig.rotationMax, angle * (180 / Math.PI))) *
                  tiltStrength
                : 0;
            const rotateEase = rotationTarget === 0 ? 0.35 : 0.18;
            rotation.current += (rotationTarget - rotation.current) * rotateEase;

            // Simple fast easing for scale (subtle, snappy click)
            const targetScale = isPressed ? pressedScale : 1;
            const easeFactor = isPressed ? 0.5 : 0.38; // Faster on press, smooth on release
            scale.current += (targetScale - scale.current) * easeFactor;

            cursorEl.style.setProperty("--cursor-x", `${drawX}px`);
            cursorEl.style.setProperty("--cursor-y", `${drawY}px`);
            cursorEl.style.setProperty("--cursor-scale", scale.current.toFixed(3));
            cursorEl.style.setProperty("--cursor-rotate", `${rotation.current}deg`);

            rafId = window.requestAnimationFrame(updatePosition);
        };

        // Wake up from idle state
        const wakeFromIdle = () => {
            if (isIdle) {
                isIdle = false;
                rafId = window.requestAnimationFrame(updatePosition);
            }
        };

        const setCursorState = (state: typeof cursorStates.default) => {
            if (activeState === state) return;
            activeState = state;
            cursorEl.style.setProperty("--cursor-image", `url("${state.image}")`);
            cursorEl.style.setProperty("--cursor-hotspot-x", `${state.hotspot.x}px`);
            cursorEl.style.setProperty("--cursor-hotspot-y", `${state.hotspot.y}px`);
        };

        const resolveCursorState = (targetElement: Element | null) => {
            if (!targetElement || !(targetElement instanceof HTMLElement)) return resolvedStates.default;
            const selectors = [
                { selector: ".cursor-pointer, a, button, [role=\"button\"], summary, label", state: resolvedStates.pointer },
                { selector: ".cursor-text, input, textarea, [contenteditable=\"true\"]", state: resolvedStates.text },
                { selector: ".cursor-move, .cursor-grab, .cursor-grabbing", state: resolvedStates.move },
                { selector: ".cursor-crosshair", state: resolvedStates.crosshair },
                { selector: ".cursor-not-allowed", state: resolvedStates.notAllowed },
                { selector: ".cursor-help", state: resolvedStates.help },
                { selector: ".cursor-ew-resize", state: resolvedStates.ewResize },
                { selector: ".cursor-ns-resize", state: resolvedStates.nsResize },
                { selector: ".cursor-nesw-resize", state: resolvedStates.neswResize },
                { selector: ".cursor-nwse-resize", state: resolvedStates.nwseResize },
            ];
            for (const entry of selectors) {
                if (targetElement.closest(entry.selector)) {
                    return entry.state;
                }
            }
            const cursor = window.getComputedStyle(targetElement).cursor.toLowerCase();
            if (cursor === "none") return resolvedStates.default;
            const keyword =
                ["pointer", "text", "move", "grab", "grabbing", "crosshair", "not-allowed", "no-drop", "help", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "default", "auto"]
                    .find((entry) => cursor.includes(entry)) ?? cursor;
            return cursorMap[keyword] ?? resolvedStates.default;
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            lastMoveAt = performance.now();
            target.x = event.clientX;
            target.y = event.clientY;
            setVisibility(true);
            wakeFromIdle(); // Restart RAF loop if we were idle
        };

        const handlePointerOver = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            setCursorState(resolveCursorState(event.target as Element));
        };

        const handlePointerDown = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            isPressed = true;
            cursorEl.classList.add("is-pressed");
        };

        const handlePointerUp = () => {
            isPressed = false;
            cursorEl.classList.remove("is-pressed");
        };

        const handlePointerLeave = () => setVisibility(false);

        setCursorState(resolvedStates.default);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("pointerover", handlePointerOver, { passive: true });
        window.addEventListener("pointerdown", handlePointerDown, { passive: true });
        window.addEventListener("pointerup", handlePointerUp, { passive: true });
        window.addEventListener("blur", handlePointerLeave);
        document.addEventListener("mouseleave", handlePointerLeave);
        rafId = window.requestAnimationFrame(updatePosition);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerover", handlePointerOver);
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("blur", handlePointerLeave);
            document.removeEventListener("mouseleave", handlePointerLeave);
            document.body.classList.remove("custom-cursor-active");
        };
    }, [states, motion]);

    return (
        <div
            ref={cursorRef}
            className="custom-cursor is-hidden"
            aria-hidden="true"
            style={
                {
                    "--cursor-width": `${(size ?? DEFAULT_CURSOR_SIZE).width}px`,
                    "--cursor-height": `${(size ?? DEFAULT_CURSOR_SIZE).height}px`,
                } as CSSProperties
            }
        />
    );
}
