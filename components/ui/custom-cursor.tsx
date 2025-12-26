"use client";

import { useEffect, useRef } from "react";

const CURSOR_SIZE = { width: 80, height: 80 };

const cursorStates = {
    default: {
        image: "/features/cursors/arrowS.png",
        hotspot: { x: 18, y: 16 },
    },
    pointer: {
        image: "/features/cursors/linkS.png",
        hotspot: { x: 18, y: 16 },
    },
    text: {
        image: "/features/cursors/beamS.png",
        hotspot: { x: 40, y: 40 },
    },
    move: {
        image: "/features/cursors/moveS.png",
        hotspot: { x: 40, y: 40 },
    },
    crosshair: {
        image: "/features/cursors/crossS.png",
        hotspot: { x: 40, y: 40 },
    },
    notAllowed: {
        image: "/features/cursors/noS.png",
        hotspot: { x: 40, y: 40 },
    },
    help: {
        image: "/features/cursors/helpS.png",
        hotspot: { x: 18, y: 16 },
    },
    ewResize: {
        image: "/features/cursors/HsizeS.png",
        hotspot: { x: 40, y: 40 },
    },
    nsResize: {
        image: "/features/cursors/VsizeS.png",
        hotspot: { x: 40, y: 40 },
    },
    neswResize: {
        image: "/features/cursors/D2sizeS.png",
        hotspot: { x: 40, y: 40 },
    },
    nwseResize: {
        image: "/features/cursors/D1sizeS.png",
        hotspot: { x: 40, y: 40 },
    },
};

const cursorMap: Record<string, typeof cursorStates.default> = {
    auto: cursorStates.default,
    default: cursorStates.default,
    pointer: cursorStates.pointer,
    text: cursorStates.text,
    move: cursorStates.move,
    grab: cursorStates.move,
    grabbing: cursorStates.move,
    crosshair: cursorStates.crosshair,
    "not-allowed": cursorStates.notAllowed,
    "no-drop": cursorStates.notAllowed,
    help: cursorStates.help,
    "ew-resize": cursorStates.ewResize,
    "ns-resize": cursorStates.nsResize,
    "nesw-resize": cursorStates.neswResize,
    "nwse-resize": cursorStates.nwseResize,
};

export function CustomCursor() {
    const cursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const cursorEl = cursorRef.current;
        if (!cursorEl || typeof window === "undefined") return;

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const finePointer = window.matchMedia("(pointer: fine)");
        if (prefersReducedMotion.matches || !finePointer.matches) return;

        document.body.classList.add("custom-cursor-active");

        let rafId = 0;
        let isVisible = false;
        let isPressed = false;
        let activeState = cursorStates.default;
        const current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const target = { x: current.x, y: current.y };
        const lastTarget = { x: target.x, y: target.y };
        const rotation = { current: 0 };
        const scale = { current: 1 };
        let lastMoveAt = performance.now();
        let lastFrameAt = performance.now();

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
            const baseFollow = 1 - Math.pow(0.001, frameDelta / 16);
            const follow = Math.min(0.85, Math.max(0.35, baseFollow + distance / 650));
            current.x += dx * follow;
            current.y += dy * follow;

            const drawX = current.x - activeState.hotspot.x;
            const drawY = current.y - activeState.hotspot.y;
            const vX = target.x - lastTarget.x;
            const vY = target.y - lastTarget.y;
            const speed = Math.hypot(vX, vY);
            const isMoving = speed > 0.35 && frameNow - lastMoveAt < 140;
            const angle = Math.atan2(dy, dx);
            const tiltStrength = Math.min(1, speed / 18);
            const targetRotate = isMoving
                ? Math.max(-10, Math.min(10, angle * (180 / Math.PI) * 0.25)) * tiltStrength
                : 0;
            const rotateEase = targetRotate === 0 ? 0.5 : 0.2;
            rotation.current += (targetRotate - rotation.current) * rotateEase;

            const targetScale = isPressed ? 0.7 : 1;
            scale.current += (targetScale - scale.current) * 0.35;

            cursorEl.style.setProperty("--cursor-x", `${drawX}px`);
            cursorEl.style.setProperty("--cursor-y", `${drawY}px`);
            cursorEl.style.setProperty("--cursor-scale", scale.current.toFixed(3));
            cursorEl.style.setProperty("--cursor-rotate", `${rotation.current}deg`);

            rafId = window.requestAnimationFrame(updatePosition);
        };

        const setCursorState = (state: typeof cursorStates.default) => {
            if (activeState === state) return;
            activeState = state;
            cursorEl.style.setProperty("--cursor-image", `url("${state.image}")`);
            cursorEl.style.setProperty("--cursor-hotspot-x", `${state.hotspot.x}px`);
            cursorEl.style.setProperty("--cursor-hotspot-y", `${state.hotspot.y}px`);
        };

        const resolveCursorState = (targetElement: Element | null) => {
            if (!targetElement || !(targetElement instanceof HTMLElement)) return cursorStates.default;
            const cursor = window.getComputedStyle(targetElement).cursor.toLowerCase();
            const keyword =
                ["pointer", "text", "move", "grab", "grabbing", "crosshair", "not-allowed", "no-drop", "help", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "default", "auto"]
                    .find((entry) => cursor.includes(entry)) ?? cursor;
            return cursorMap[keyword] ?? cursorStates.default;
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
            lastTarget.x = target.x;
            lastTarget.y = target.y;
            lastMoveAt = performance.now();
            target.x = event.clientX;
            target.y = event.clientY;
            setVisibility(true);
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

        setCursorState(cursorStates.default);
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
    }, []);

    return (
        <div
            ref={cursorRef}
            className="custom-cursor is-hidden"
            aria-hidden="true"
            style={{
                width: CURSOR_SIZE.width,
                height: CURSOR_SIZE.height,
            }}
        />
    );
}
