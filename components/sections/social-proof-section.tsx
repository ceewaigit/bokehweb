"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Check, Star, Zap } from "lucide-react";

interface SocialProofItem {
    icon?: React.ReactNode;
    text: string;
    highlight?: string;
}

interface SocialProofSectionProps {
    className?: string;
    title?: React.ReactNode;
    items?: SocialProofItem[];
    logos?: { src: string; alt: string }[];
}

const defaultItems: SocialProofItem[] = [
    { icon: <Star className="w-4 h-4" />, text: "4.9/5 rating", highlight: "from early teams" },
    { icon: <Zap className="w-4 h-4" />, text: "10k+ screen recordings", highlight: "polished" },
    { icon: <Check className="w-4 h-4" />, text: "Hours saved", highlight: "every week" },
];

export function SocialProofSection({
    className,
    title = "Trusted by teams shipping screen recordings every week",
    items = defaultItems,
    logos,
}: SocialProofSectionProps) {
    const gpuStyle = { willChange: 'transform, opacity' as const, transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const };
    const accentStyles = [
        "text-amber-600 bg-amber-50 ring-amber-100",
        "text-sky-600 bg-sky-50 ring-sky-100",
        "text-emerald-600 bg-emerald-50 ring-emerald-100",
    ];
    const textAccentStyles = [
        "text-slate-900",
        "text-slate-900",
        "text-slate-900",
    ];
    const highlightAccentStyles = [
        "text-amber-600",
        "text-sky-600",
        "text-emerald-600",
    ];

    return (
        <section className={cn("py-20 px-6 pt-[25vh]", className)}>
            <div className="mx-auto max-w-5xl">
                {/* Title */}
                <motion.h2
                    className="text-center text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-balance mb-10 text-slate-900"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    style={gpuStyle}
                >
                    {title}
                </motion.h2>

                {/* Stats/Features Row */}
                <motion.div
                    className="flex flex-wrap items-center justify-center gap-3 md:gap-4"
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
                    style={gpuStyle}
                >
                    {items.map((item, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200/70 bg-white/80 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5"
                        >
                            {item.icon && (
                                <span
                                    className={cn(
                                        "inline-flex h-6 w-6 items-center justify-center rounded-full ring-1",
                                        accentStyles[index % accentStyles.length]
                                    )}
                                >
                                    {item.icon}
                                </span>
                            )}
                            <span
                                className={cn(
                                    "text-[13px] font-medium tracking-[0.015em]",
                                    textAccentStyles[index % textAccentStyles.length]
                                )}
                            >
                                {item.text}
                            </span>
                            {item.highlight && (
                                <span
                                    className={cn(
                                        "text-[13px] tracking-[0.01em]",
                                        highlightAccentStyles[index % highlightAccentStyles.length]
                                    )}
                                >
                                    {item.highlight}
                                </span>
                            )}
                        </div>
                    ))}
                </motion.div>

                {/* Logo Bar (if provided) */}
                {logos && logos.length > 0 && (
                    <motion.div
                        className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mt-12 opacity-50"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 0.5 }}
                        viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
                    style={{ willChange: 'opacity' as const, transform: 'translateZ(0)' }}
                >
                        {logos.map((logo, index) => (
                            <img
                                key={index}
                                src={logo.src}
                                alt={logo.alt}
                                className="h-6 md:h-8 w-auto grayscale hover:grayscale-0 transition-all"
                            />
                        ))}
                    </motion.div>
                )}
            </div>
        </section>
    );
}
