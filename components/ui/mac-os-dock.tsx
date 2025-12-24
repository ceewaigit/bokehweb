'use client';

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';

export interface DockApp {
    id: string;
    name: string;
    icon: string;
    iconClassName?: string;
}

export interface MacOSDockProps {
    apps: DockApp[];
    onAppClick: (appId: string) => void;
    openApps?: string[];
    className?: string;
}

const MacOSDock: React.FC<MacOSDockProps> = ({
    apps,
    onAppClick,
    openApps = [],
    className = ''
}) => {
    const [mouseX, setMouseX] = useState<number | null>(null);
    const [currentScales, setCurrentScales] = useState<number[]>(apps.map(() => 1));
    const [currentPositions, setCurrentPositions] = useState<number[]>([]);
    const dockRef = useRef<HTMLDivElement>(null);
    const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const lastMouseMoveTime = useRef<number>(0);
    const animateToTargetRef = useRef<() => void>(() => { });

    const getResponsiveConfig = useCallback(() => {
        if (typeof window === 'undefined') {
            return { baseIconSize: 64, maxScale: 1.6, effectWidth: 240 };
        }
        const screenWidth = window.innerWidth;
        const smallerDimension = Math.min(screenWidth, window.innerHeight);

        // Calculate maximum icon size that will fit all icons with spacing
        const numIcons = apps.length;
        const horizontalPadding = 48; // Total padding (24px each side)
        const dockInternalPadding = 20; // Internal dock padding (10px each side)
        const minSpacingPerIcon = 6; // Minimum gap between icons
        const availableForIcons = screenWidth - horizontalPadding - dockInternalPadding - (numIcons - 1) * minSpacingPerIcon;
        const maxFitIconSize = Math.floor(availableForIcons / numIcons);

        // Determine base icon size based on screen size, but constrained to fit
        let baseIconSize: number;
        let maxScale: number;
        let effectWidth: number;

        if (screenWidth < 400) {
            // Very small phones
            baseIconSize = Math.min(36, maxFitIconSize);
            maxScale = 1.2;
            effectWidth = screenWidth * 0.35;
        } else if (screenWidth < 480) {
            // Small phones
            baseIconSize = Math.min(42, maxFitIconSize);
            maxScale = 1.25;
            effectWidth = screenWidth * 0.38;
        } else if (screenWidth < 640) {
            // Regular phones
            baseIconSize = Math.min(48, maxFitIconSize);
            maxScale = 1.35;
            effectWidth = screenWidth * 0.4;
        } else if (screenWidth < 768) {
            // Large phones / small tablets
            baseIconSize = Math.min(56, maxFitIconSize);
            maxScale = 1.5;
            effectWidth = 200;
        } else if (smallerDimension < 900) {
            // Tablets
            baseIconSize = Math.min(64, maxFitIconSize);
            maxScale = 1.6;
            effectWidth = 260;
        } else {
            // Desktop
            baseIconSize = Math.min(72, maxFitIconSize, smallerDimension * 0.05);
            maxScale = 1.8;
            effectWidth = 300;
        }

        // Final safety clamp - ensure icons fit
        baseIconSize = Math.max(28, Math.min(baseIconSize, maxFitIconSize));

        return { baseIconSize, maxScale, effectWidth };
    }, [apps.length]);

    const [config, setConfig] = useState(getResponsiveConfig);
    const { baseIconSize, maxScale, effectWidth } = config;

    const minScale = 1.0;
    const baseSpacing = Math.max(4, baseIconSize * 0.08);

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Initial config on mount
        setConfig(getResponsiveConfig());
    }, [getResponsiveConfig]);

    useEffect(() => {
        if (!mounted) return;

        let resizeTimeout: NodeJS.Timeout;
        const handleResize = () => {
            // Debounce resize for performance
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                setConfig(getResponsiveConfig());
            }, 50); // Reduced debounce for snappier response
        };

        // Listen to resize events
        window.addEventListener('resize', handleResize);

        // Also trigger on initial mount
        handleResize();

        return () => {
            clearTimeout(resizeTimeout);
            window.removeEventListener('resize', handleResize);
        };
    }, [mounted, getResponsiveConfig]);

    const calculateTargetMagnification = useCallback((mousePosition: number | null) => {
        if (mousePosition === null) {
            return apps.map(() => minScale);
        }
        return apps.map((_, index) => {
            const normalIconCenter = (index * (baseIconSize + baseSpacing)) + (baseIconSize / 2);
            const minX = mousePosition - (effectWidth / 2);
            const maxX = mousePosition + (effectWidth / 2);

            if (normalIconCenter < minX || normalIconCenter > maxX) {
                return minScale;
            }

            const theta = ((normalIconCenter - minX) / effectWidth) * 2 * Math.PI;
            const cappedTheta = Math.min(Math.max(theta, 0), 2 * Math.PI);
            const scaleFactor = (1 - Math.cos(cappedTheta)) / 2;

            return minScale + (scaleFactor * (maxScale - minScale));
        });
    }, [apps, baseIconSize, baseSpacing, effectWidth, maxScale, minScale]);

    const calculatePositions = useCallback((scales: number[]) => {
        let currentX = 0;

        return scales.map((scale) => {
            const scaledWidth = baseIconSize * scale;
            const centerX = currentX + (scaledWidth / 2);
            currentX += scaledWidth + baseSpacing;
            return centerX;
        });
    }, [baseIconSize, baseSpacing]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const initialScales = apps.map(() => minScale);
        const initialPositions = calculatePositions(initialScales);
        setCurrentScales(initialScales);
        setCurrentPositions(initialPositions);
    }, [apps, calculatePositions, minScale, config]);

    const animateToTarget = useCallback(() => {
        const targetScales = calculateTargetMagnification(mouseX);
        const targetPositions = calculatePositions(targetScales);
        const lerpFactor = mouseX !== null ? 0.2 : 0.12;

        setCurrentScales(prevScales => {
            return prevScales.map((currentScale, index) => {
                const diff = targetScales[index] - currentScale;
                return currentScale + (diff * lerpFactor);
            });
        });

        setCurrentPositions(prevPositions => {
            return prevPositions.map((currentPos, index) => {
                const diff = targetPositions[index] - currentPos;
                return currentPos + (diff * lerpFactor);
            });
        });

        const scalesNeedUpdate = currentScales.some((scale, index) =>
            Math.abs(scale - targetScales[index]) > 0.002
        );
        const positionsNeedUpdate = currentPositions.some((pos, index) =>
            Math.abs(pos - targetPositions[index]) > 0.1
        );

        if (scalesNeedUpdate || positionsNeedUpdate || mouseX !== null) {
            // Use ref to avoid recursion error
            if (animateToTargetRef.current) {
                animationFrameRef.current = requestAnimationFrame(animateToTargetRef.current);
            }
        }
    }, [mouseX, calculateTargetMagnification, calculatePositions, currentScales, currentPositions]);

    // Keep ref in sync
    useEffect(() => {
        animateToTargetRef.current = animateToTarget;
    }, [animateToTarget]);

    useEffect(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        // Kick off animation
        animationFrameRef.current = requestAnimationFrame(animateToTarget); // Safe to call directly here? Or use ref?
        // Using ref is safer to match the pattern generally, but here 'animateToTarget' is defined.
        // However, calling it inside the effect deps on it, which is fine.

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [animateToTarget]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const now = performance.now();

        if (now - lastMouseMoveTime.current < 16) {
            return;
        }

        lastMouseMoveTime.current = now;

        if (dockRef.current) {
            const rect = dockRef.current.getBoundingClientRect();
            const padding = Math.max(8, baseIconSize * 0.12);
            setMouseX(e.clientX - rect.left - padding);
        }
    }, [baseIconSize]);

    const handleMouseLeave = useCallback(() => {
        setMouseX(null);
    }, []);

    // Touch handlers for mobile - expand on touch
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (dockRef.current && e.touches.length > 0) {
            const touch = e.touches[0];
            const rect = dockRef.current.getBoundingClientRect();
            const padding = Math.max(8, baseIconSize * 0.12);
            setMouseX(touch.clientX - rect.left - padding);
        }
    }, [baseIconSize]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const now = performance.now();
        if (now - lastMouseMoveTime.current < 16) return;
        lastMouseMoveTime.current = now;

        if (dockRef.current && e.touches.length > 0) {
            const touch = e.touches[0];
            const rect = dockRef.current.getBoundingClientRect();
            const padding = Math.max(8, baseIconSize * 0.12);
            setMouseX(touch.clientX - rect.left - padding);
        }
    }, [baseIconSize]);

    const handleTouchEnd = useCallback(() => {
        // Small delay before collapsing for better visual feedback
        setTimeout(() => setMouseX(null), 150);
    }, []);

    // Simple, elegant bounce animation - subtle and refined
    const createBounceAnimation = useCallback((element: HTMLElement) => {
        const bounceHeight = -baseIconSize * 0.2; // Subtle 20% lift

        // Single smooth bounce up and back
        element.style.transition = 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)';
        element.style.transform = `translateY(${bounceHeight}px)`;

        setTimeout(() => {
            element.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
            element.style.transform = 'translateY(0px)';
        }, 180);
    }, [baseIconSize]);

    const handleAppClick = (appId: string, index: number) => {
        const element = iconRefs.current[index];
        if (element) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof window !== 'undefined' && (window as any).gsap) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const gsap = (window as any).gsap;

                // Simple elegant bounce with GSAP
                gsap.to(element, {
                    y: -baseIconSize * 0.2,
                    duration: 0.18,
                    ease: 'power2.out',
                    yoyo: true,
                    repeat: 1,
                    transformOrigin: 'bottom center'
                });
            } else {
                createBounceAnimation(element);
            }
        }

        onAppClick(appId);
    };

    const contentWidth = currentPositions.length > 0
        ? Math.max(...currentPositions.map((pos, index) =>
            pos + (baseIconSize * currentScales[index]) / 2
        ))
        : (apps.length * (baseIconSize + baseSpacing)) - baseSpacing;

    const padding = Math.max(8, baseIconSize * 0.12);

    if (!mounted) {
        return null;
    }

    // Calculate the maximum scaled size for proper container sizing
    const maxScaledSize = baseIconSize * maxScale;
    const overflowHeight = maxScaledSize - baseIconSize;

    return (
        <div
            ref={dockRef}
            className={cn('backdrop-blur-md', className)}
            style={{
                width: `${contentWidth + padding * 2}px`,
                maxWidth: '100%',
                background: 'rgba(45, 45, 45, 0.75)',
                borderRadius: `${Math.max(12, baseIconSize * 0.4)}px`,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: `
          0 ${Math.max(4, baseIconSize * 0.1)}px ${Math.max(16, baseIconSize * 0.4)}px rgba(0, 0, 0, 0.4),
          0 ${Math.max(2, baseIconSize * 0.05)}px ${Math.max(8, baseIconSize * 0.2)}px rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.15),
          inset 0 -1px 0 rgba(0, 0, 0, 0.2)
        `,
                padding: `${padding}px`,
                // Allow icons to overflow above the dock
                overflow: 'visible',
                // Add margin-top to account for overflow when expanded
                marginTop: `${overflowHeight}px`,
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="relative"
                style={{
                    height: `${baseIconSize}px`,
                    width: '100%',
                    overflow: 'visible',
                }}
            >
                {apps.map((app, index) => {
                    const scale = currentScales[index];
                    const position = currentPositions[index] || 0;
                    const scaledSize = baseIconSize * scale;

                    return (
                        <div
                            key={app.id}
                            ref={(el) => { iconRefs.current[index] = el; }}
                            className="absolute cursor-pointer flex flex-col items-center justify-end"
                            title={app.name}
                            onClick={() => handleAppClick(app.id, index)}
                            style={{
                                left: `${position - scaledSize / 2}px`,
                                bottom: '0px',
                                width: `${scaledSize}px`,
                                height: `${scaledSize}px`,
                                transformOrigin: 'bottom center',
                                zIndex: Math.round(scale * 10)
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={app.icon}
                                alt={app.name}
                                width={scaledSize}
                                height={scaledSize}
                                className={cn("object-contain", app.iconClassName)}
                                style={{
                                    filter: `drop-shadow(0 ${scale > 1.2 ? Math.max(2, baseIconSize * 0.05) : Math.max(1, baseIconSize * 0.03)}px ${scale > 1.2 ? Math.max(4, baseIconSize * 0.1) : Math.max(2, baseIconSize * 0.06)}px rgba(0,0,0,${0.2 + (scale - 1) * 0.15}))`
                                }}
                            />

                            {openApps.includes(app.id) && (
                                <div
                                    className="absolute"
                                    style={{
                                        bottom: `${Math.max(-2, -baseIconSize * 0.05)}px`,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        width: `${Math.max(3, baseIconSize * 0.06)}px`,
                                        height: `${Math.max(3, baseIconSize * 0.06)}px`,
                                        borderRadius: '50%',
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        boxShadow: '0 0 4px rgba(0, 0, 0, 0.3)',
                                    }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MacOSDock;
