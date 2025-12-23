"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, VideoHTMLAttributes } from "react";
import { Play, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Reset states when src changes
        setIsLoading(true);
        setIsPlaying(false);

        const attemptPlay = async () => {
            try {
                if (video.paused) {
                    await video.play();
                }
            } catch (error) {
                // Autoplay might be blocked or failed, which is expected in some browsers
                // We leave isPlaying as false so the user can manually play
                setIsPlaying(false);
            }
        };

        if (src) {
            attemptPlay();
        }
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
        e.stopPropagation();
        if (videoRef.current) {
            videoRef.current.play().catch(() => { });
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full h-full group cursor-pointer overflow-hidden", containerClassName)}
            onClick={togglePlay}
        >
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
                // Detailed state tracking
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onPlaying={() => {
                    setIsPlaying(true);
                    setIsLoading(false);
                }}
                onWaiting={() => setIsLoading(true)}
                onLoadedData={() => setIsLoading(false)}
                {...props}
            />

            {/* Overlay Container */}
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <AnimatePresence mode="wait">
                    {/* Loading Spinner */}
                    {isLoading && (
                        <motion.div
                            key="loader"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-black/20 backdrop-blur-md rounded-full p-3"
                        >
                            <Loader2 className="w-8 h-8 text-white/80 animate-spin" strokeWidth={2} />
                        </motion.div>
                    )}

                    {/* Play Button */}
                    {!isPlaying && !isLoading && (
                        <motion.button
                            key="play-button"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: "spring", damping: 15, stiffness: 200 }}
                            onClick={handlePlayClick}
                            className={cn(
                                "group/button relative flex items-center justify-center pointer-events-auto",
                                "w-20 h-20 rounded-full",
                                "bg-white/10 backdrop-blur-xl border border-white/20",
                                "shadow-[0_8px_32px_rgba(0,0,0,0.25)]",
                                "transition-colors duration-300 hover:bg-white/20"
                            )}
                            aria-label="Play video"
                        >
                            {/* Inner glow ring */}
                            <div className="absolute inset-0 rounded-full border border-white/10 opacity-50" />

                            {/* Icon */}
                            <Play
                                className="w-8 h-8 text-white fill-white translate-x-0.5 drop-shadow-sm"
                                strokeWidth={0}
                            />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
