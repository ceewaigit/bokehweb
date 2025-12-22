"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface BeforeAfterSliderProps {
    beforeSrc: string;
    afterSrc: string;
    beforeAlt?: string;
    afterAlt?: string;
    className?: string;
    initialPosition?: number;
}

export function BeforeAfterSlider({
    beforeSrc,
    afterSrc,
    beforeAlt = "Before",
    afterAlt = "After",
    className,
    initialPosition = 50,
}: BeforeAfterSliderProps) {
    const [sliderPosition, setSliderPosition] = useState(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const isActive = isDragging || isHovering;

    const updatePosition = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPosition(percentage);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        updatePosition(e.clientX);
    }, [updatePosition]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        setIsDragging(true);
        updatePosition(e.touches[0].clientX);
    }, [updatePosition]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                updatePosition(e.clientX);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (isDragging && e.touches.length > 0) {
                updatePosition(e.touches[0].clientX);
            }
        };

        const handleEnd = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleEnd);
            window.addEventListener("touchmove", handleTouchMove, { passive: true });
            window.addEventListener("touchend", handleEnd);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleEnd);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("touchend", handleEnd);
        };
    }, [isDragging, updatePosition]);

    // Accent color matching the playhead
    const accentColor = "rgb(139, 92, 246)"; // violet-500

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative w-full h-full overflow-hidden select-none cursor-ew-resize rounded-xl",
                className
            )}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            style={{ WebkitTapHighlightColor: "transparent" }}
        >
            {/* After image (background) */}
            <div className="absolute inset-0">
                <Image
                    src={afterSrc}
                    alt={afterAlt}
                    fill
                    className="object-cover object-center pointer-events-none"
                    draggable={false}
                    priority
                />
            </div>

            {/* Before image (clipped) - slightly lower quality look */}
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
                <Image
                    src={beforeSrc}
                    alt={beforeAlt}
                    fill
                    className="object-cover object-center pointer-events-none blur-[0.2px]"
                    draggable={false}
                    priority
                />
            </div>

            {/* Clean solid divider line */}
            <motion.div
                className="absolute top-0 bottom-0 z-10"
                style={{
                    left: `${sliderPosition}%`,
                    x: "-50%",
                    width: "1.5px",
                    backgroundColor: accentColor,
                }}
                animate={{ opacity: isActive ? 1 : 0.85 }}
                transition={{ duration: 0.2 }}
            />

            {/* Playhead-style grip handle */}
            <motion.div
                className="absolute z-20 flex items-center justify-center"
                style={{
                    left: `${sliderPosition}%`,
                    top: "50%",
                    x: "-50%",
                    y: "-50%",
                }}
            >
                {/* Pill-shaped grip */}
                <motion.div
                    className="relative flex flex-col items-center justify-center gap-[3px]"
                    style={{
                        width: 12,
                        height: 28,
                        backgroundColor: accentColor,
                        borderRadius: 6,
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                    }}
                    animate={{
                        opacity: isActive ? 1 : 0.9,
                        scale: isDragging ? 1.05 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                    {/* Grip dots */}
                    <div
                        className="rounded-full"
                        style={{
                            width: 3,
                            height: 3,
                            backgroundColor: "rgba(0, 0, 0, 0.3)"
                        }}
                    />
                    <div
                        className="rounded-full"
                        style={{
                            width: 3,
                            height: 3,
                            backgroundColor: "rgba(0, 0, 0, 0.3)"
                        }}
                    />
                    <div
                        className="rounded-full"
                        style={{
                            width: 3,
                            height: 3,
                            backgroundColor: "rgba(0, 0, 0, 0.3)"
                        }}
                    />
                </motion.div>
            </motion.div>

            {/* Small top handle (like playhead) - visible when not active */}
            <motion.div
                className="absolute z-20"
                style={{
                    left: `${sliderPosition}%`,
                    top: 0,
                    x: "-50%",
                }}
                animate={{
                    opacity: isActive ? 0 : 0.9,
                    scale: isActive ? 0.8 : 1,
                }}
                transition={{ duration: 0.2 }}
            >
                <div
                    style={{
                        width: 10,
                        height: 14,
                        backgroundColor: accentColor,
                        borderRadius: 5,
                    }}
                />
            </motion.div>

            {/* Labels */}
            <motion.div
                className="absolute top-3 left-3 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] bg-black/60 backdrop-blur-md text-white/90 rounded-md"
                animate={{ opacity: sliderPosition > 15 ? 1 : 0 }}
                transition={{ duration: 0.15 }}
            >
                Before
            </motion.div>
            <motion.div
                className="absolute top-3 right-3 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] bg-white/80 backdrop-blur-md text-gray-700 rounded-md"
                animate={{ opacity: sliderPosition < 85 ? 1 : 0 }}
                transition={{ duration: 0.15 }}
            >
                After
            </motion.div>
        </div>
    );
}
