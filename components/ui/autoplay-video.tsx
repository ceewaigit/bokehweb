"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, VideoHTMLAttributes, useMemo, useCallback } from "react";
import { Play, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence, useInView } from "framer-motion";

interface AutoplayVideoProps extends VideoHTMLAttributes<HTMLVideoElement> {
    containerClassName?: string;
}

export function AutoplayVideo({
    className,
    containerClassName,
    src,
    loop = true,
    ...props
}: AutoplayVideoProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    // Check if video is in viewport - plays only when visible
    const isInView = useInView(containerRef, {
        margin: "0px", // Exact intersection
        amount: 0.5 // Require 50% visibility to play
    });

    // Retry mechanism
    const retryCount = useRef(0);
    const maxRetries = 3;

    // Determine mime type hint
    const mimeType = useMemo(() => {
        if (!src || typeof src !== 'string') return undefined;
        if (src.endsWith(".webm")) return "video/webm";
        if (src.endsWith(".mp4")) return "video/mp4";
        return undefined;
    }, [src]);

    useEffect(() => {
        // Reset states when src changes
        setIsLoading(true);
        setIsPlaying(false);
        setHasError(false);
        retryCount.current = 0;
    }, [src]);

    // Handle play/pause based on visibility and playback state
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const managePlayback = async () => {
            try {
                if (isInView && !hasError) {
                    if (video.paused) {
                        const playPromise = video.play();
                        if (playPromise !== undefined) {
                            await playPromise;
                        }
                    }
                } else {
                    if (!video.paused) {
                        video.pause();
                    }
                }
            } catch (error) {
                // Auto-play might be blocked or other errors
                console.warn("AutoplayVideo: Playback control failed", error);
                setIsPlaying(false);
            }
        };

        if (video.readyState >= 3) {
            setIsLoading(false);
            managePlayback();
        } else {
            video.load();
        }

    }, [isInView, src, hasError]);

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

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHasError(false);
        setIsLoading(true);
        retryCount.current = 0; // Manual retry resets count
        if (videoRef.current) {
            videoRef.current.load();
        }
    };

    const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const video = e.currentTarget;
        const error = video.error;
        console.error("AutoplayVideo Error:", error?.code, error?.message, "SRC:", src);

        // Don't show error for simple aborts during navigation
        if (error?.code === MediaError.MEDIA_ERR_ABORTED) return;

        // Auto-retry logic
        if (retryCount.current < maxRetries) {
            retryCount.current++;
            console.log(`AutoplayVideo: Retrying... (${retryCount.current}/${maxRetries})`);
            setTimeout(() => {
                if (videoRef.current) videoRef.current.load();
            }, 1000); // Wait 1s before retry
        } else {
            setIsLoading(false);
            setIsPlaying(false);
            setHasError(true);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full h-full group cursor-pointer overflow-hidden rounded-inherit", containerClassName)}
            onClick={togglePlay}
        >
            <video
                ref={videoRef}
                key={String(src || 'empty')} // FORCE REMOUNT ON SOURCE CHANGE
                className={cn("w-full h-full object-cover", className)}
                // Static props
                muted={true}
                loop={loop}
                // autoPlay removed to strictly control via JS
                playsInline={true}
                preload="metadata" // Lazy load - only fetch metadata initially
                // State handlers
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onPlaying={() => {
                    setIsPlaying(true);
                    setIsLoading(false);
                    setHasError(false);
                }}
                // Removed costly onTimeUpdate - onPlaying is sufficient for state sync
                onWaiting={() => setIsLoading(true)}
                onLoadedData={() => setIsLoading(false)}
                onCanPlay={() => setIsLoading(false)}
                onLoadedMetadata={() => setIsLoading(false)}
                onError={handleError}
                {...props}
            >
                {typeof src === 'string' && <source src={src} type={mimeType} />}
            </video>

            {/* Overlay Container */}
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none p-4">
                <AnimatePresence mode="wait">
                    {/* Error State - Retry Button */}
                    {hasError && (
                        <motion.button
                            key="error"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={handleRetry}
                            className="bg-red-500/10 backdrop-blur-md rounded-full p-3 border border-red-500/20 pointer-events-auto hover:bg-red-500/20 transition-colors group/error"
                            title="Click to retry"
                        >
                            <RefreshCw className="w-5 h-5 text-red-500 group-hover/error:rotate-180 transition-transform duration-500" />
                        </motion.button>
                    )}

                    {/* Loading Spinner */}
                    {isLoading && !hasError && (
                        <motion.div
                            key="loader"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="bg-black/20 backdrop-blur-md rounded-full p-3"
                        >
                            <Loader2 className="w-5 h-5 text-white/70 animate-spin" strokeWidth={2} />
                        </motion.div>
                    )}

                    {/* Play Button - Redesigned: Minimal, Refined, Modern */}
                    {!isPlaying && !isLoading && !hasError && (
                        <motion.button
                            key="play-button"
                            initial={{ opacity: 0, scale: 0.9, y: 0 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: "spring", damping: 20, stiffness: 300 }}
                            onClick={handlePlayClick}
                            className={cn(
                                "group/button relative flex items-center justify-center pointer-events-auto",
                                "w-14 h-14 rounded-full", // Smaller, less bloated
                                "bg-black/20 backdrop-blur-md border border-white/20", // Subtle glass
                                "shadow-lg shadow-black/10",
                                "transition-all duration-300 hover:bg-black/30 hover:border-white/30 hover:shadow-xl"
                            )}
                            aria-label="Play video"
                        >
                            <Play
                                className="w-5 h-5 text-white fill-white opacity-90 group-hover/button:opacity-100 transition-opacity"
                                strokeWidth={0}
                            />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
