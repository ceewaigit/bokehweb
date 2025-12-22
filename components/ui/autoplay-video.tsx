"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, VideoHTMLAttributes } from "react";

interface AutoplayVideoProps extends VideoHTMLAttributes<HTMLVideoElement> {
    containerClassName?: string;
}

export function AutoplayVideo({
    className,
    containerClassName,
    src,
    ...props
}: AutoplayVideoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Force play on mount to handle React Strict Mode / Re-mounts
        const startPlay = () => {
            if (video.paused) {
                video.play().catch(() => {
                    // benign expected error if user hasn't interacted or elements are hidden
                });
            }
        }

        // Attempt immediate start
        startPlay();

        // 2. Delayed Observation:
        // Wait for entrance animations to finish
        const timeoutId = setTimeout(() => {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            // Component is visible on screen.
                            // Force play.
                            video.play().catch((e) => {
                                // If this fails, it might be due to a race condition or low power mode.
                                // We could retry, but usually this catches the 'aborted' error.
                            });
                        } else {
                            // Component is off screen.
                            // Pause to save battery.
                            video.pause();
                        }
                    });
                },
                {
                    threshold: 0, // Play if ANY part is visible
                    rootMargin: "0px"
                }
            );

            observer.observe(video);
            observerRef.current = observer;
        }, 600);

        return () => {
            clearTimeout(timeoutId);
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [src]);

    return (
        <div ref={containerRef} className={cn("relative w-full h-full", containerClassName)}>
            <video
                ref={videoRef}
                className={cn("w-full h-full object-cover", className)}
                src={src}
                // Static props for maximum compatibility
                muted={true}
                loop={true}
                autoPlay={true}
                playsInline={true}
                preload="auto"
                {...props}
            />
        </div>
    );
}
