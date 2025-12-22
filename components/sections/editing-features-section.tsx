"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { LucideIcon, ZoomIn, Keyboard, Crop, Wand2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";

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
        icon: ZoomIn,
        title: "Auto zoom",
        description: "Clicks get spotlighted automatically. Crisp framing, perfect timing.",
        media: { type: "video", src: "/features/zoom-720.mp4", alt: "Auto zoom demo" },
    },
    {
        icon: Keyboard,
        title: "Typing speed-up",
        description: "Long typing bursts speed up on their own. No manual cuts.",
        media: { type: "video", src: "/features/typingspeedup.mp4", alt: "Typing speed-up demo" },
    },
    {
        icon: Crop,
        title: "Crop & aspect ratios",
        description: "Platform-ready presets in one click. Adjust framing anytime.",
        media: { type: "image", src: "/features/crop.png", alt: "Crop and aspect ratios" },
    },
    {
        icon: Wand2,
        title: "Lossless zoom",
        description: "Zooms stay sharp by using your full source resolution.",
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
            <div className="relative isolate">
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const imageTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isInView = useInView(sectionRef, { margin: "-10% 0px -10% 0px" });

    const gpuStyle = {
        willChange: 'transform, opacity' as const,
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden' as const
    };

    // Handle video end - advance to next
    const handleVideoEnd = () => {
        setCurrentIndex((prev) => (prev + 1) % features.length);
    };

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

    useEffect(() => {
        if (!isInView) {
            videoRef.current?.pause();
            return;
        }

        if (features[currentIndex]?.media?.type === "video") {
            videoRef.current?.play().catch(() => undefined);
        }
    }, [currentIndex, features, isInView]);

    const currentMedia = features[currentIndex]?.media;
    const currentFeature = features[currentIndex];

    return (
        <section
            id={id}
            ref={sectionRef}
            className={cn("relative py-16 md:py-24 px-4 md:px-6 overflow-hidden", className)}
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
                            style={gpuStyle}
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
                        className="text-3xl md:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.02em] leading-[1.08] text-balance text-gray-900 mb-4 md:mb-5"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        style={gpuStyle}
                    >
                        {title}
                    </motion.h2>
                    {subtitle && (
                        <motion.p
                            className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.15 }}
                            style={gpuStyle}
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
                    style={gpuStyle}
                >
                    <MediaFrame className="mx-auto">
                        <div className="relative aspect-video overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentIndex}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="absolute inset-0"
                                >
                                    {currentMedia?.type === "video" ? (
                                            <video
                                                ref={videoRef}
                                                className="w-full h-full object-cover"
                                                autoPlay={isInView}
                                                muted
                                                playsInline
                                                preload="metadata"
                                                onEnded={handleVideoEnd}
                                            >
                                            <source src={currentMedia.src} type="video/mp4" />
                                        </video>
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
                        </div>
                    </MediaFrame>

                    {/* Mobile: Current feature label below video */}
                    <div className="md:hidden mt-4 text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
                            <currentFeature.icon className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-gray-700">{currentFeature?.title}</span>
                        </div>
                        {/* Mobile progress dots */}
                        <div className="flex justify-center gap-1.5 mt-3">
                            {features.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentIndex(index)}
                                    className={cn(
                                        "h-1.5 rounded-full transition-all duration-300",
                                        index === currentIndex
                                            ? "w-6 bg-gray-900"
                                            : "w-1.5 bg-gray-300"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Desktop: Feature List - 4 Columns with indicators */}
                <div className="hidden md:grid md:grid-cols-4 gap-4 lg:gap-6">
                    {features.map((feature, index) => (
                        <motion.button
                            key={feature.title}
                            onClick={() => setCurrentIndex(index)}
                            className={cn(
                                "group relative text-left cursor-pointer transition-all duration-300",
                                index === currentIndex && "scale-[1.02]"
                            )}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ duration: 0.5, delay: 0.1 + index * 0.08 }}
                            style={gpuStyle}
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
