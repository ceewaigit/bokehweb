"use client";

import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { BrowserFrame } from "@/components/ui/browser-frame";
import { BeforeAfterSlider } from "@/components/ui/before-after-slider";
import Image from "next/image";
import { LucideIcon } from "lucide-react";
import { useRef, useState } from "react";

// Cursor follow component for smooth cursor demo
function CursorFollowImage({
    src,
    alt,
    className
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isInteracting, setIsInteracting] = useState(false);
    const [isTouching, setIsTouching] = useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Smooth spring animation - this creates the "stabilized" effect
    const springConfig = { damping: 25, stiffness: 150, mass: 0.5 };
    const x = useSpring(mouseX, springConfig);
    const y = useSpring(mouseY, springConfig);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!containerRef.current || isTouching) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = ((e.clientX - rect.left) - centerX) * 0.4;
        const offsetY = ((e.clientY - rect.top) - centerY) * 0.4;
        mouseX.set(offsetX);
        mouseY.set(offsetY);
    };

    const handleMouseLeave = () => {
        if (isTouching) return;
        setIsInteracting(false);
        mouseX.set(0);
        mouseY.set(0);
    };

    // Touch support for mobile
    const handleTouchStart = (e: React.TouchEvent) => {
        setIsTouching(true);
        setIsInteracting(true);
        handleTouchMove(e);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!containerRef.current || e.touches.length === 0) return;
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = ((touch.clientX - rect.left) - centerX) * 0.4;
        const offsetY = ((touch.clientY - rect.top) - centerY) * 0.4;
        mouseX.set(offsetX);
        mouseY.set(offsetY);
    };

    const handleTouchEnd = () => {
        setIsTouching(false);
        setIsInteracting(false);
        mouseX.set(0);
        mouseY.set(0);
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center cursor-none outline-none ring-0 border-none"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsInteracting(true)}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ WebkitTapHighlightColor: 'transparent' }}
        >
            <motion.div
                style={{ x, y }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="outline-none ring-0"
            >
                <Image
                    src={src}
                    alt={alt}
                    width={800}
                    height={600}
                    className={cn(className, "drop-shadow-[0_8px_24px_rgba(0,0,0,0.15)] pointer-events-none select-none")}
                    draggable={false}
                />
            </motion.div>
            {/* Subtle hint text - hidden on mobile to avoid overlap */}
            <motion.span
                className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 font-medium pointer-events-none hidden sm:block"
                initial={{ opacity: 0 }}
                animate={{ opacity: isInteracting ? 0 : 0.7 }}
                transition={{ duration: 0.2 }}
            >
                hover to try
            </motion.span>
        </div>
    );
}

interface Feature {
    icon?: LucideIcon;
    title: string;
    description: string;
    image?: string;
    video?: string;
    beforeImage?: string;
    afterImage?: string;
    span?: "sm" | "md" | "lg";
    imagePlacement?: "top" | "middle" | "bottom";
    textPosition?: "left" | "right"; // Controls text placement on md/lg cards
    backdrop?: "dots" | "grid" | "gradient";
    variant?: "default" | "outline" | "ghost";
    isGraphic?: boolean;
    imageClassName?: string;
    interactive?: "click" | "hover-tilt" | "cursor-follow" | "before-after";
}

interface FeatureShowcaseSectionProps {
    className?: string;
    id?: string;
    badge?: string;
    title: React.ReactNode;
    subtitle?: string;
    features: Feature[];
    heroImage?: string;
}

export function FeatureShowcaseSection({
    className,
    id,
    badge,
    title,
    subtitle,
    features,
    heroImage,
}: FeatureShowcaseSectionProps) {
    const gpuStyle = { willChange: 'transform, opacity' as const, transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const };
    const spanClasses = {
        sm: "md:col-span-1",
        md: "md:col-span-1 lg:col-span-2",
        lg: "md:col-span-2 lg:col-span-3",
    };

    // Refined warm color palettes with shadow colors
    const accentPalettes = [
        {
            name: "rose",
            icon: "bg-gradient-to-br from-rose-100 to-orange-50 text-rose-600",
            iconShadow: "shadow-[0_4px_12px_rgba(244,63,94,0.25),0_1px_3px_rgba(244,63,94,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-rose-50/80 via-white to-amber-50/40",
            curve: "from-rose-100/60 via-amber-50/30 to-transparent",
            dotColor: "rgba(244,63,94,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(244,63,94,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
        {
            name: "sky",
            icon: "bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-600",
            iconShadow: "shadow-[0_4px_12px_rgba(14,165,233,0.25),0_1px_3px_rgba(14,165,233,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-sky-50/80 via-white to-cyan-50/40",
            curve: "from-sky-100/60 via-cyan-50/30 to-transparent",
            dotColor: "rgba(14,165,233,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(14,165,233,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
        {
            name: "emerald",
            icon: "bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-600",
            iconShadow: "shadow-[0_4px_12px_rgba(16,185,129,0.25),0_1px_3px_rgba(16,185,129,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-emerald-50/80 via-white to-lime-50/40",
            curve: "from-emerald-100/60 via-lime-50/30 to-transparent",
            dotColor: "rgba(16,185,129,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(16,185,129,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
        {
            name: "violet",
            icon: "bg-gradient-to-br from-violet-100 to-purple-50 text-violet-600",
            iconShadow: "shadow-[0_4px_12px_rgba(139,92,246,0.25),0_1px_3px_rgba(139,92,246,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-violet-50/80 via-white to-fuchsia-50/40",
            curve: "from-violet-100/60 via-purple-50/30 to-transparent",
            dotColor: "rgba(139,92,246,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(139,92,246,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
        {
            name: "amber",
            icon: "bg-gradient-to-br from-amber-100 to-yellow-50 text-amber-600",
            iconShadow: "shadow-[0_4px_12px_rgba(245,158,11,0.25),0_1px_3px_rgba(245,158,11,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-amber-50/80 via-white to-orange-50/40",
            curve: "from-amber-100/60 via-orange-50/30 to-transparent",
            dotColor: "rgba(245,158,11,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(245,158,11,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
        {
            name: "cyan",
            icon: "bg-gradient-to-br from-cyan-100 to-teal-50 text-cyan-600",
            iconShadow: "shadow-[0_4px_12px_rgba(6,182,212,0.25),0_1px_3px_rgba(6,182,212,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
            surface: "from-cyan-50/80 via-white to-sky-50/40",
            curve: "from-cyan-100/60 via-teal-50/30 to-transparent",
            dotColor: "rgba(6,182,212,0.12)",
            imageShadow: "shadow-[0_8px_32px_rgba(6,182,212,0.15),0_4px_12px_rgba(0,0,0,0.08)]",
        },
    ];

    const imageLayoutBySpan = {
        sm: { grid: "grid-cols-1", gridReverse: "grid-cols-1", minHeight: "min-h-[280px]" },
        md: { grid: "sm:grid-cols-[1fr_1.2fr]", gridReverse: "sm:grid-cols-[1.2fr_1fr]", minHeight: "min-h-[360px] sm:min-h-[260px]" },
        lg: { grid: "sm:grid-cols-[0.8fr_1.2fr]", gridReverse: "sm:grid-cols-[1.2fr_0.8fr]", minHeight: "min-h-[420px] sm:min-h-[300px]" },
    };

    const paddingByPlacement = {
        top: { sm: "items-start", md: "items-start", lg: "items-start" },
        middle: { sm: "items-center", md: "items-center", lg: "items-center" },
        bottom: { sm: "items-end", md: "items-end", lg: "items-end" },
    };

    return (
        <section id={id} className={cn("py-24 px-6", className)}>
            <div className="mx-auto max-w-6xl">
                {/* Section Header */}
                <div className="text-center mb-16">
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
                                className="mb-4 bg-violet-50 text-violet-700 border-violet-100"
                            >
                                {badge}
                            </Badge>
                        </motion.div>
                    )}
                    <motion.h2
                        className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] text-balance text-gray-900 mb-4 [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium"
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
                            className="text-lg text-gray-500 max-w-2xl mx-auto"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            style={gpuStyle}
                        >
                            {subtitle}
                        </motion.p>
                    )}
                </div>

                {/* Hero Image with Browser Frame */}
                {heroImage && (
                    <div className="mb-16">
                        <BrowserFrame className="max-w-4xl mx-auto" variant="light">
                            <Image
                                src={heroImage}
                                alt="Product showcase"
                                width={1920}
                                height={1080}
                                className="w-full h-auto"
                            />
                        </BrowserFrame>
                    </div>
                )}

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {features.map((feature, index) => {
                        const palette = accentPalettes[index % accentPalettes.length];
                        const backdrop = feature.backdrop || "dots";
                        const placement = feature.imagePlacement || "middle";
                        const spanKey = feature.span || "sm";
                        const textPos = feature.textPosition || "left";
                        const imageLayout = imageLayoutBySpan[spanKey];
                        const imageAlign = paddingByPlacement[placement][spanKey];
                        const variant = feature.variant || "default";
                        const isTextRight = textPos === "right" && spanKey !== "sm";

                        return (
                            <motion.div
                                key={feature.title}
                                className={cn(
                                    "group relative overflow-hidden rounded-[24px]",
                                    "transition-[background-color,box-shadow,ring] duration-300 ease-out",
                                    imageLayout.minHeight,
                                    variant === "default" && [
                                        "bg-white/95 backdrop-blur-sm",
                                        "border border-white/60",
                                        "ring-1 ring-gray-900/[0.04]",
                                        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_16px_48px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)]",
                                        "hover:ring-gray-900/[0.08] hover:bg-white",
                                        "hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08),0_24px_64px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]",
                                    ],
                                    variant === "ghost" && [
                                        "bg-white/70 backdrop-blur-sm",
                                        "border border-white/40",
                                        "ring-1 ring-gray-900/[0.03]",
                                        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]",
                                    ],
                                    variant === "outline" && [
                                        "bg-white/40",
                                        "border border-gray-200/60",
                                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
                                    ],
                                    spanClasses[feature.span || "sm"]
                                )}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                whileHover={{ y: -4 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
                                style={gpuStyle}
                            >
                                {/* Base gradient surface */}
                                <div className={cn(
                                    "absolute inset-0 bg-gradient-to-br",
                                    palette.surface
                                )} />

                                {/* Dots pattern with fade mask - THE KEY ELEMENT */}
                                {backdrop === "dots" && (
                                    <div
                                        className="absolute inset-0"
                                        style={{
                                            backgroundImage: `radial-gradient(circle at 1px 1px, ${palette.dotColor} 1.5px, transparent 0)`,
                                            backgroundSize: "16px 16px",
                                            maskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 75%, black 100%)",
                                            WebkitMaskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 75%, black 100%)",
                                        }}
                                    />
                                )}

                                {/* Grid pattern with fade mask */}
                                {backdrop === "grid" && (
                                    <div
                                        className="absolute inset-0"
                                        style={{
                                            backgroundImage: `
                                                linear-gradient(to right, ${palette.dotColor} 1px, transparent 1px),
                                                linear-gradient(to bottom, ${palette.dotColor} 1px, transparent 1px)
                                            `,
                                            backgroundSize: "24px 24px",
                                            maskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 75%, black 100%)",
                                            WebkitMaskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 75%, black 100%)",
                                        }}
                                    />
                                )}

                                {/* Gradient backdrop - soft colorful wash */}
                                {backdrop === "gradient" && (
                                    <div
                                        className="absolute inset-0 opacity-40"
                                        style={{
                                            backgroundImage: `
                                                radial-gradient(ellipse 80% 60% at 80% 30%, ${palette.dotColor.replace('0.12', '0.25')}, transparent 60%),
                                                radial-gradient(ellipse 60% 50% at 20% 80%, ${palette.dotColor.replace('0.12', '0.18')}, transparent 50%)
                                            `,
                                            maskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.3) 30%, black 70%)",
                                            WebkitMaskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.3) 30%, black 70%)",
                                        }}
                                    />
                                )}

                                {/* Curved gradient overlay - eases away */}
                                <div
                                    className={cn(
                                        "absolute inset-y-0 right-0 w-[60%] bg-gradient-to-l opacity-80",
                                        palette.curve
                                    )}
                                    style={{ clipPath: "ellipse(80% 95% at 100% 50%)" }}
                                />

                                {/* Subtle edge highlights for depth */}
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
                                <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-white/60 via-white/20 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-black/[0.03] to-transparent" />

                                {/* Content */}
                                <div className={cn(
                                    "relative z-10 h-full p-5 flex",
                                    spanKey === "sm" && placement === "top" ? "flex-col-reverse" : "flex-col",
                                    (feature.image || feature.video || (feature.beforeImage && feature.afterImage)) && spanKey !== "sm" && "sm:grid sm:gap-2",
                                    (feature.image || feature.video || (feature.beforeImage && feature.afterImage)) && spanKey !== "sm" && (isTextRight ? imageLayout.gridReverse : imageLayout.grid)
                                )}>
                                    {/* Text content */}
                                    <div className={cn(
                                        "flex flex-col gap-3 flex-shrink-0",
                                        spanKey !== "sm" && "sm:flex-shrink justify-center",
                                        spanKey === "sm" && placement === "top" && "mt-auto",
                                        isTextRight && "sm:order-2"
                                    )}>
                                        {/* Icon */}
                                        {feature.icon && (
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                                "transition-transform duration-300 group-hover:scale-105",
                                                palette.icon,
                                                palette.iconShadow
                                            )}>
                                                <feature.icon className="w-5 h-5" strokeWidth={1.5} />
                                            </div>
                                        )}

                                        {/* Title */}
                                        <h3 className="font-semibold text-[1.125rem] leading-tight tracking-tight text-gray-900">
                                            {feature.title}
                                        </h3>

                                        {/* Description */}
                                        <p className="text-[0.9375rem] text-gray-500 leading-[1.6] tracking-[-0.01em]">
                                            {feature.description}
                                        </p>
                                    </div>

                                    {/* Feature Image */}
                                    {(feature.image || feature.video || (feature.beforeImage && feature.afterImage)) && (
                                        <div className={cn(
                                            "flex-1 flex min-h-0",
                                            isTextRight && "sm:order-1",
                                            spanKey === "sm" && placement === "top" ? "justify-end items-start mb-4 -mr-5 -mt-5" : "",
                                            spanKey === "sm" && placement !== "top" ? "justify-end items-end mt-4 -mr-5 -mb-5" : "",
                                            spanKey !== "sm" && !isTextRight && cn("justify-end", imageAlign),
                                            spanKey !== "sm" && !isTextRight && !feature.isGraphic && "mt-4 -mr-5 -mb-5 sm:mt-0 sm:-mt-5",
                                            spanKey !== "sm" && isTextRight && cn("justify-start", imageAlign),
                                            spanKey !== "sm" && isTextRight && !feature.isGraphic && "mt-4 -ml-5 -mb-5 sm:mt-0 sm:-mt-5"
                                        )}>
                                            <div className={cn(
                                                "relative",
                                                spanKey === "sm" ? "w-[55%] h-[120px]" : "w-full h-full",
                                                !feature.isGraphic && "overflow-hidden",
                                                !feature.isGraphic && spanKey === "sm" && placement === "top" && "rounded-bl-xl",
                                                !feature.isGraphic && spanKey === "sm" && placement !== "top" && "rounded-tl-xl",
                                                !feature.isGraphic && spanKey !== "sm" && !isTextRight && "rounded-tl-xl rounded-bl-xl",
                                                !feature.isGraphic && spanKey !== "sm" && isTextRight && "rounded-tr-xl rounded-br-xl",
                                                !feature.isGraphic && palette.imageShadow,
                                                !feature.isGraphic && "ring-1 ring-black/[0.08]",
                                                feature.isGraphic && "flex justify-center items-center"
                                            )}>
                                                {feature.video ? (
                                                    <video
                                                        className={cn(
                                                            feature.isGraphic
                                                                ? (feature.imageClassName || "max-w-full max-h-full object-contain drop-shadow-lg")
                                                                : cn("absolute inset-0 w-full h-full object-cover", isTextRight ? "object-right" : "object-left")
                                                        )}
                                                        autoPlay
                                                        loop
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                    >
                                                        <source src={feature.video} type="video/mp4" />
                                                    </video>
                                                ) : feature.interactive === "before-after" && feature.beforeImage && feature.afterImage ? (
                                                    <BeforeAfterSlider
                                                        beforeSrc={feature.beforeImage}
                                                        afterSrc={feature.afterImage}
                                                        beforeAlt={`${feature.title} - Before`}
                                                        afterAlt={`${feature.title} - After`}
                                                        className="absolute inset-0 w-full h-full"
                                                    />
                                                ) : feature.interactive === "cursor-follow" ? (
                                                    <CursorFollowImage
                                                        src={feature.image!}
                                                        alt={feature.title}
                                                        className={feature.imageClassName || "max-w-full max-h-full object-contain"}
                                                    />
                                                ) : feature.interactive === "click" ? (
                                                    <motion.div
                                                        className="cursor-pointer select-none"
                                                        whileTap={{ scale: 0.92, rotate: -2 }}
                                                        whileHover={{ scale: 1.02 }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                                                    >
                                                        <Image
                                                            src={feature.image!}
                                                            alt={feature.title}
                                                            width={800}
                                                            height={600}
                                                            className={cn(
                                                                feature.isGraphic
                                                                    ? cn(feature.imageClassName || "max-w-full max-h-full object-contain", "drop-shadow-[0_8px_24px_rgba(0,0,0,0.15)]")
                                                                    : cn("absolute inset-0 w-full h-full object-cover", isTextRight ? "object-right" : "object-left")
                                                            )}
                                                            draggable={false}
                                                        />
                                                    </motion.div>
                                                ) : (
                                                    <Image
                                                        src={feature.image!}
                                                        alt={feature.title}
                                                        width={800}
                                                        height={600}
                                                        className={cn(
                                                            feature.isGraphic
                                                                ? cn(feature.imageClassName || "max-w-full max-h-full object-contain", "drop-shadow-[0_8px_24px_rgba(0,0,0,0.15)]")
                                                                : cn("absolute inset-0 w-full h-full object-cover", isTextRight ? "object-right" : "object-left")
                                                        )}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
