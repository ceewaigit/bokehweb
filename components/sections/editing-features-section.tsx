"use client";

import { cn } from "@/lib/utils";
import { gpuAccelerated } from "@/lib/animation-utils";
import { motion, AnimatePresence, useInView, PanInfo } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { LucideIcon, ZoomIn, Keyboard, Crop, Wand2, Type, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { AutoplayVideo } from "@/components/ui/autoplay-video";
import { Highlighter } from "@/components/ui/highlighter";

import { BeforeAfterSlider } from "@/components/ui/before-after-slider";

interface MediaItem {
    type: "video" | "image" | "component";
    src?: string;
    alt?: string;
    component?: React.ReactNode;
}

interface FeatureItem {
    icon: LucideIcon;
    title: string;
    description: string;
    media: MediaItem;
}

interface EditingFeaturesSectionProps {
    className?: string;
    id?: string;
    badge?: string;
    title: React.ReactNode;
    subtitle?: string;
    features?: FeatureItem[];
}

const defaultFeatures: FeatureItem[] = [
    {
        icon: Crop,
        title: "Timeline",
        description: "Edit by feel. A tactile timeline designed for flow, not clutter.",
        media: { type: "video", src: "/features/timeline.webm", alt: "Timeline demo" },
    },
    {
        icon: ZoomIn,
        title: "Auto zoom",
        description: "Focus, automated. We zoom on the action so your viewers never get lost.",
        media: { type: "video", src: "/features/zoom.webm", alt: "Auto zoom demo" },
    },
    {
        icon: Keyboard,
        title: "Typing speed-up",
        description: "Accelerated input. Turn 20 seconds of typing into 2 seconds of action.",
        media: { type: "video", src: "/features/typingspeedup.webm", alt: "Typing speed-up demo" },
    },
    {
        icon: Type,
        title: "Auto keystrokes",
        description: "Keystrokes, visualized. Shortcuts appear on screen, perfectly timed.",
        media: { type: "video", src: "/features/keystroke.webm", alt: "Keystroke demo" },
    },
    {
        icon: Wand2,
        title: "Lossless zoom",
        description: "Infinite detail. Zoom in deep without losing a single pixel of clarity.",
        media: {
            type: "component",
            component: (
                <BeforeAfterSlider
                    beforeSrc="/features/before.png"
                    afterSrc="/features/after.png"
                    beforeAlt="Standard"
                    afterAlt="High-res Zoom"
                    className="w-full h-full"
                />
            )
        },
    },
];

// Custom refined frame component - clean, app-style
function MediaFrame({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn(
            "relative rounded-2xl md:rounded-3xl overflow-hidden",
            "bg-gradient-to-br from-gray-900/[0.02] via-transparent to-gray-900/[0.04]",
            "ring-1 ring-black/[0.06]",
            "shadow-[0_2px_4px_rgba(0,0,0,0.02),0_12px_40px_rgba(0,0,0,0.08),0_32px_80px_rgba(0,0,0,0.04)]",
            className
        )}>
            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-2xl md:rounded-3xl ring-1 ring-inset ring-white/40 pointer-events-none" />

            {/* Content */}
            <div className="relative isolate h-full">
                {children}
            </div>

            {/* Top edge highlight */}
            <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />

            {/* Bottom edge shadow line */}
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-black/[0.04] to-transparent pointer-events-none" />
        </div>
    );
}

export function EditingFeaturesSection({
    className,
    id,
    badge = "Smart defaults",
    title,
    subtitle,
    features = defaultFeatures,
}: EditingFeaturesSectionProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const sectionRef = useRef<HTMLElement | null>(null);
    const imageTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isInView = useInView(sectionRef, { margin: "0px 0px 0px 0px" });

    // Handle video end - advance to next
    const handleVideoEnd = () => {
        setCurrentIndex((prev) => (prev + 1) % features.length);
    };

    // Navigation functions
    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % features.length);
    }, [features.length]);

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + features.length) % features.length);
    }, [features.length]);

    // Handle swipe gestures for mobile
    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const swipeThreshold = 50; // Minimum swipe distance
        const swipeVelocityThreshold = 200; // Minimum velocity for a swipe

        if (Math.abs(info.offset.x) > swipeThreshold || Math.abs(info.velocity.x) > swipeVelocityThreshold) {
            if (info.offset.x > 0) {
                // Swiped right - go to previous
                goToPrevious();
            } else {
                // Swiped left - go to next
                goToNext();
            }
        }
    }, [goToNext, goToPrevious]);

    // For images, auto-advance after 4 seconds. Components (like slider) do NOT auto-advance.
    useEffect(() => {
        const currentFeature = features[currentIndex];

        if (isInView && currentFeature?.media?.type === "image") {
            imageTimerRef.current = setTimeout(() => {
                setCurrentIndex((prev) => (prev + 1) % features.length);
            }, 4000);
        }

        return () => {
            if (imageTimerRef.current) {
                clearTimeout(imageTimerRef.current);
            }
        };
    }, [currentIndex, features, isInView]);

    const currentMedia = features[currentIndex]?.media;
    const currentFeature = features[currentIndex];

    return (
        <section
            id={id}
            ref={sectionRef}
            className={cn("relative py-12 sm:py-16 lg:py-24 px-4 sm:px-6 overflow-hidden", className)}
        >
            {/* Background */}
            <SectionBackdrop variant="shimmer" fade="all" className="opacity-70" />

            <div className="relative mx-auto max-w-5xl">
                {/* Section Header */}
                <div className="text-center mb-8 md:mb-12">
                    {badge && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                            style={gpuAccelerated}
                        >
                            <Badge
                                variant="secondary"
                                className="mb-4 bg-amber-50 text-amber-700 border-amber-100"
                            >
                                {badge}
                            </Badge>
                        </motion.div>
                    )}
                    <motion.h2
                        className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.02em] leading-[1.1] text-balance text-gray-900 mb-3 sm:mb-4 md:mb-5"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        style={gpuAccelerated}
                    >
                        {title}
                    </motion.h2>
                    {subtitle && (
                        <motion.p
                            className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed tracking-tight text-balance"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.15 }}
                            style={gpuAccelerated}
                        >
                            {subtitle}
                        </motion.p>
                    )}
                </div>

                {/* Hero Media Carousel - works on both mobile and desktop */}
                <motion.div
                    className="mb-8 md:mb-14"
                    initial={{ opacity: 0, y: 30, scale: 0.98 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    style={gpuAccelerated}
                >
                    <MediaFrame className="mx-auto">
                        {/* Swipe container for mobile navigation - disabled for interactive components */}
                        <motion.div
                            className={cn(
                                "relative aspect-video overflow-hidden touch-pan-y",
                                currentMedia?.type !== "component" && "cursor-grab active:cursor-grabbing"
                            )}
                            drag={currentMedia?.type !== "component" ? "x" : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={currentMedia?.type !== "component" ? handleDragEnd : undefined}
                        >
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentIndex}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className="absolute inset-0"
                                >
                                    {currentMedia?.type === "video" ? (
                                        <AutoplayVideo
                                            src={currentMedia.src!}
                                            onEnded={handleVideoEnd}
                                            loop={false}
                                        />
                                    ) : currentMedia?.type === "component" ? (
                                        <div className="w-full h-full bg-white">
                                            {currentMedia.component}
                                        </div>
                                    ) : (
                                        <img
                                            src={currentMedia?.src}
                                            alt={currentMedia?.alt || "Feature showcase"}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>
                    </MediaFrame>

                    {/* Mobile: Current feature label below video - swipeable */}
                    <motion.div
                        className="md:hidden mt-4 text-center cursor-grab active:cursor-grabbing touch-pan-y"
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.15}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                            <currentFeature.icon className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-gray-700">{currentFeature?.title}</span>
                        </div>
                        {/* Mobile progress dots with larger touch targets */}
                        <div className="flex justify-center gap-3 mt-3 py-2">
                            {features.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentIndex(index)}
                                    className={cn(
                                        "relative py-2 px-1 -my-2", // Large touch target
                                    )}
                                    aria-label={`Go to feature ${index + 1}`}
                                >
                                    <span className={cn(
                                        "block h-1.5 rounded-full transition-all duration-300",
                                        index === currentIndex
                                            ? "w-6 bg-gray-900"
                                            : "w-1.5 bg-gray-300"
                                    )} />
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>

                {/* Desktop: Feature List - 5 Columns with indicators */}
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
                    {features.map((feature, index) => (
                        <motion.button
                            key={feature.title}
                            onClick={() => setCurrentIndex(index)}
                            className={cn(
                                "group relative text-left cursor-pointer transition-all duration-200",
                                index === currentIndex && "scale-[1.02]"
                            )}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ duration: 0.4, delay: 0.08 + index * 0.05 }}
                            style={gpuAccelerated}
                        >
                            {/* Feature Card */}
                            <div className="flex flex-col gap-3">
                                {/* Icon with active indicator */}
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                                    index === currentIndex
                                        ? "bg-gray-900 text-white scale-105"
                                        : "bg-gray-100 text-gray-600 group-hover:bg-gray-200"
                                )}>
                                    <feature.icon className="w-5 h-5" strokeWidth={1.5} />
                                </div>

                                {/* Title */}
                                <h3 className={cn(
                                    "font-semibold text-[1.0625rem] tracking-[-0.01em] transition-colors duration-300",
                                    index === currentIndex ? "text-gray-900" : "text-gray-700"
                                )}>
                                    {feature.title}
                                </h3>

                                {/* Description */}
                                <p className={cn(
                                    "text-[0.9375rem] leading-[1.6] tracking-[-0.005em] transition-colors duration-300",
                                    index === currentIndex ? "text-gray-600" : "text-gray-500"
                                )}>
                                    {feature.description}
                                </p>
                            </div>

                            {/* Active indicator bar */}
                            <div className={cn(
                                "absolute -bottom-2 left-0 h-0.5 bg-gray-900 rounded-full transition-all duration-300",
                                index === currentIndex ? "w-full opacity-100" : "w-0 opacity-0"
                            )} />
                        </motion.button>
                    ))}
                </div>
            </div>
        </section>
    );
}
