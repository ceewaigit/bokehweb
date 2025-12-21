"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface Feature {
    icon: LucideIcon;
    title: string;
    description: string;
    highlight?: string;
}

interface FeatureGridProps {
    className?: string;
    badge?: string;
    title: React.ReactNode;
    subtitle?: string;
    features: Feature[];
    columns?: 2 | 3 | 4;
}

export function FeatureGrid({
    className,
    badge,
    title,
    subtitle,
    features,
    columns = 4,
}: FeatureGridProps) {
    const gridCols = {
        2: "md:grid-cols-2",
        3: "md:grid-cols-3",
        4: "md:grid-cols-2 lg:grid-cols-4",
    };
    const fadeInStyle = { opacity: 0 };

    return (
        <section className={cn("relative py-24 px-6", className)}>
            <div className="absolute inset-x-0 top-8 h-56 bg-[radial-gradient(circle_at_center,hsla(var(--primary),0.08),transparent_70%)] blur-3xl" />
            <div className="relative mx-auto max-w-6xl">
                {/* Section Header */}
                <div className="text-center mb-16">
                    {badge && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                            style={fadeInStyle}
                        >
                            <Badge
                                variant="secondary"
                                className="mb-4 bg-white/70 text-foreground border border-white/40 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur"
                            >
                                {badge}
                            </Badge>
                        </motion.div>
                    )}
                    <motion.h2
                        className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-balance text-foreground mb-4 font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-primary"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        style={fadeInStyle}
                    >
                        {title}
                    </motion.h2>
                    {subtitle && (
                        <motion.p
                            className="text-lg text-muted-foreground max-w-2xl mx-auto"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            style={fadeInStyle}
                        >
                            {subtitle}
                        </motion.p>
                    )}
                </div>

                {/* Feature Cards */}
                <div className={cn("grid gap-6", gridCols[columns])}>
                    {features.map((feature, index) => (
                        <motion.div
                            key={feature.title}
                            className={cn(
                                "group relative overflow-hidden p-6 rounded-2xl",
                                "bg-white/75 border border-white/40 backdrop-blur-2xl",
                                "shadow-[0_12px_32px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset]",
                                "transition-all duration-300",
                                "hover:shadow-[0_18px_48px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.95)_inset]",
                                "hover:-translate-y-0.5",
                                "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_12%_0%,rgba(255,255,255,0.5),transparent_60%)]",
                                "after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(140deg,rgba(15,23,42,0.05),transparent_45%,rgba(15,23,42,0.08))] after:opacity-40"
                            )}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.4, delay: index * 0.06 }}
                            style={fadeInStyle}
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-white/80 text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.12)] ring-1 ring-white/60 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                                    <feature.icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-slate-900 mb-2">
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {feature.description}
                                        {feature.highlight && (
                                            <span className="text-slate-900 font-medium"> {feature.highlight}</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
