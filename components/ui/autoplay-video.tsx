"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, VideoHTMLAttributes } from "react";
import { Play } from "lucide-react";

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
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const attemptPlay = async () => {
            try {
                if (video.paused) {
                    await video.play();
                }
            } catch (error) {
                // benign catch
            }
        };

        attemptPlay();
    }, [src]);

    const togglePlay = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play().catch(() => { });
            } else {
                videoRef.current.pause();
            }
        }
    };

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent double-triggering if video also receives click
        if (videoRef.current) {
            videoRef.current.play().catch(() => { });
        }
    };

    return (
        <div ref={containerRef} className={cn("relative w-full h-full group cursor-pointer", containerClassName)} onClick={togglePlay}>
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
                // Strict event handling for UI sync:
                onPlaying={() => setIsPlaying(true)} // Only hide button when frames are moving
                onPause={() => setIsPlaying(false)}  // Show button when paused
                onWaiting={() => setIsPlaying(false)} // Show button when buffering/stalled
                {...props}
            />

            {/* Fallback Play Button - Visible when not playing */}
            <div
                className={cn(
                    "absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300 pointer-events-none",
                    isPlaying ? "opacity-0" : "opacity-100"
                )}
            >
                <button
                    onClick={handlePlayClick}
                    className={cn(
                        "group/button relative flex h-16 w-16 items-center justify-center rounded-full pointer-events-auto",
                        "bg-white/25 backdrop-blur-md border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.2)]",
                        "transition-all duration-300 hover:scale-110 hover:bg-white/35 active:scale-95",
                    )}
                    aria-label="Play video"
                >
                    <Play className="h-6 w-6 fill-white text-white ml-1" strokeWidth={0} />
                    {/* Subtle inner ring for detail */}
                    <div className="absolute inset-1 rounded-full border border-white/10" />
                </button>
            </div>
        </div>
    );
}
