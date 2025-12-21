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
    { icon: <Star className="w-4 h-4" />, text: "4.9/5 average", highlight: "from early makers" },
    { icon: <Zap className="w-4 h-4" />, text: "10,000+", highlight: "creators" },
    { icon: <Check className="w-4 h-4" />, text: "Loved by", highlight: "designers & creators" },
];

export function SocialProofSection({
    className,
    title = "Trusted by creators and product teams for screen recordings",
    items = defaultItems,
    logos,
}: SocialProofSectionProps) {
    const fadeInStyle = { opacity: 0 };

    return (
        <section className={cn("py-20 px-6 pt-[25vh]", className)}>
            <div className="mx-auto max-w-5xl">
                {/* Title */}
                <motion.h2
                    className="text-center text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-balance mb-12 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    style={fadeInStyle}
                >
                    {title}
                </motion.h2>

                {/* Stats/Features Row */}
                <motion.div
                    className="flex flex-wrap items-center justify-center gap-4 md:gap-6"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    style={fadeInStyle}
                >
                    {items.map((item, index) => (
                        <motion.div
                            key={index}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/55 bg-white/70 shadow-[0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]"
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 260, damping: 22 }}
                        >
                            {item.icon && (
                                <span className="text-slate-500">{item.icon}</span>
                            )}
                            <span className="text-[13px] font-semibold tracking-[0.02em] text-slate-900">
                                {item.text}
                            </span>
                            {item.highlight && (
                                <span className="text-[13px] text-slate-500 tracking-[0.01em]">
                                    {item.highlight}
                                </span>
                            )}
                        </motion.div>
                    ))}
                </motion.div>

                {/* Logo Bar (if provided) */}
                {logos && logos.length > 0 && (
                    <motion.div
                        className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mt-12 opacity-50"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 0.5 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        style={fadeInStyle}
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
