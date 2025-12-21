"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { BrowserFrame } from "@/components/ui/browser-frame";
import Image from "next/image";
import { LucideIcon } from "lucide-react";

interface Feature {
    icon?: LucideIcon;
    title: string;
    description: string;
    image?: string;
    video?: string;
    span?: "sm" | "md" | "lg";
    imagePlacement?: "top" | "middle" | "bottom";
    backdrop?: "dots" | "grid" | "gradient";
}

interface FeatureShowcaseSectionProps {
    className?: string;
    badge?: string;
    title: React.ReactNode;
    subtitle?: string;
    features: Feature[];
    heroImage?: string;
}

export function FeatureShowcaseSection({
    className,
    badge,
    title,
    subtitle,
    features,
    heroImage,
}: FeatureShowcaseSectionProps) {
    const spanClasses = {
        sm: "md:col-span-1",
        md: "md:col-span-1 lg:col-span-2",
        lg: "md:col-span-2 lg:col-span-3",
    };

    // Refined warm color palettes
    const accentPalettes = [
        {
            name: "rose",
            icon: "bg-gradient-to-br from-rose-100 to-orange-50 text-rose-600 ring-rose-200/50",
            surface: "from-rose-50/80 via-white to-amber-50/40",
            curve: "from-rose-100/60 via-amber-50/30 to-transparent",
            dotColor: "rgba(244,63,94,0.12)",
        },
        {
            name: "sky",
            icon: "bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-600 ring-sky-200/50",
            surface: "from-sky-50/80 via-white to-cyan-50/40",
            curve: "from-sky-100/60 via-cyan-50/30 to-transparent",
            dotColor: "rgba(14,165,233,0.12)",
        },
        {
            name: "emerald",
            icon: "bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-600 ring-emerald-200/50",
            surface: "from-emerald-50/80 via-white to-lime-50/40",
            curve: "from-emerald-100/60 via-lime-50/30 to-transparent",
            dotColor: "rgba(16,185,129,0.12)",
        },
        {
            name: "violet",
            icon: "bg-gradient-to-br from-violet-100 to-purple-50 text-violet-600 ring-violet-200/50",
            surface: "from-violet-50/80 via-white to-fuchsia-50/40",
            curve: "from-violet-100/60 via-purple-50/30 to-transparent",
            dotColor: "rgba(139,92,246,0.12)",
        },
        {
            name: "amber",
            icon: "bg-gradient-to-br from-amber-100 to-yellow-50 text-amber-600 ring-amber-200/50",
            surface: "from-amber-50/80 via-white to-orange-50/40",
            curve: "from-amber-100/60 via-orange-50/30 to-transparent",
            dotColor: "rgba(245,158,11,0.12)",
        },
        {
            name: "cyan",
            icon: "bg-gradient-to-br from-cyan-100 to-teal-50 text-cyan-600 ring-cyan-200/50",
            surface: "from-cyan-50/80 via-white to-sky-50/40",
            curve: "from-cyan-100/60 via-teal-50/30 to-transparent",
            dotColor: "rgba(6,182,212,0.12)",
        },
    ];

    const imageLayoutBySpan = {
        sm: { grid: "sm:grid-cols-[1fr_1fr]" },
        md: { grid: "sm:grid-cols-[0.9fr_1.1fr]" },
        lg: { grid: "sm:grid-cols-[0.8fr_1.2fr]" },
    };

    const paddingByPlacement = {
        top: { sm: "self-start", md: "self-start", lg: "self-start" },
        middle: { sm: "self-center", md: "self-center", lg: "self-center" },
        bottom: { sm: "self-end", md: "self-end", lg: "self-end" },
    };

    return (
        <section className={cn("py-24 px-6", className)}>
            <div className="mx-auto max-w-6xl">
                {/* Section Header */}
                <div className="text-center mb-16">
                    {badge && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
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
                        const imageLayout = imageLayoutBySpan[spanKey];
                        const imageAlign = paddingByPlacement[placement][spanKey];

                        return (
                            <motion.div
                                key={feature.title}
                                className={cn(
                                    "group relative overflow-hidden rounded-[32px]",
                                    "bg-white/95 backdrop-blur-sm texture-dots-light",
                                    "border border-gray-200/50",
                                    "shadow-[0_2px_8px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.05)]",
                                    "transition-all duration-500 ease-out",
                                    "hover:-translate-y-1.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08),0_32px_64px_rgba(0,0,0,0.1)]",
                                    "hover:border-gray-200/80",
                                    spanClasses[feature.span || "sm"]
                                )}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-50px" }}
                                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
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
                                            maskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 75%, black 100%)",
                                            WebkitMaskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 75%, black 100%)",
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
                                            maskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 75%, black 100%)",
                                            WebkitMaskImage: "linear-gradient(to left, transparent 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 75%, black 100%)",
                                        }}
                                    />
                                )}

                                {/* Gradient backdrop - soft colorful wash */}
                                {backdrop === "gradient" && (
                                    <div
                                        className="absolute inset-0 opacity-60"
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

                                {/* Subtle top highlight */}
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

                                {/* Content */}
                                <div className={cn(
                                    "relative z-10 grid h-full gap-4 p-6",
                                    (feature.image || feature.video) ? cn("grid-cols-1", imageLayout.grid) : "grid-cols-1"
                                )}>
                                    <div className="flex h-full flex-col justify-between gap-4">
                                        <div>
                                            {/* Icon */}
                                            {feature.icon && (
                                                <div className={cn(
                                                    "w-11 h-11 rounded-2xl flex items-center justify-center mb-4",
                                                    "ring-1 shadow-sm",
                                                    palette.icon
                                                )}>
                                                    <feature.icon className="w-5 h-5" strokeWidth={1.5} />
                                                </div>
                                            )}

                                            {/* Title */}
                                            <h3 className="font-semibold text-lg text-gray-900 mb-2">
                                                {feature.title}
                                            </h3>

                                            {/* Description */}
                                            <p className="text-sm text-gray-500 leading-relaxed">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>

                                {/* Feature Image - BLEEDS OUT / CUT OFF */}
                                    {(feature.image || feature.video) && (
                                        <div className={cn(
                                            "flex sm:justify-end -mr-6 -mb-6",
                                            placement === "top" && "-mt-2",
                                            placement === "bottom" && "mt-auto",
                                            imageAlign
                                        )}>
                                            <div className="w-full overflow-hidden rounded-tl-2xl rounded-bl-2xl shadow-[0_8px_30px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.06]">
                                                {feature.video ? (
                                                    <video
                                                        className="h-full w-full object-cover object-left"
                                                        autoPlay
                                                        loop
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                    >
                                                        <source src={feature.video} type="video/mp4" />
                                                    </video>
                                                ) : (
                                                    <Image
                                                        src={feature.image!}
                                                        alt={feature.title}
                                                        width={1100}
                                                        height={800}
                                                        className="h-full w-full object-cover object-left"
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
