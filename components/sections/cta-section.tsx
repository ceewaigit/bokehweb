"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HandArrow } from "@/components/ui/hand-arrow";
import { ChevronRight } from "lucide-react";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface CTASectionProps {
    className?: string;
    title: React.ReactNode;
    subtitle?: string;
    ctaLabel?: string;
    ctaHref?: string;
    showArrow?: boolean;
    arrowText?: string;
    showFounderMessage?: boolean;
    founder?: {
        name: string;
        avatar?: string;
        message?: string;
    };
}

export function CTASection({
    className,
    title,
    subtitle,
    ctaLabel = "Get started for free",
    ctaHref = "#",
    showArrow = true,
    arrowText = "Ready to ship a clearer update?",
    showFounderMessage = false,
    founder,
}: CTASectionProps) {
    const gpuStyle = { willChange: 'transform, opacity' as const, transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const };

    return (
        <TooltipProvider delayDuration={0}>
            <section
                className={cn(
                    "relative py-32 px-6 overflow-hidden",
                    className
                )}
            >


                <div className="mx-auto max-w-3xl text-center">
                    {/* Arrow with Text */}
                    {showArrow && (
                        <motion.div
                            className="flex items-center justify-center gap-2 mb-8"
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            style={gpuStyle}
                        >
                            <span className="text-sm text-gray-400 italic">{arrowText}</span>
                            <HandArrow direction="down-right" size="sm" className="text-gray-400" />
                        </motion.div>
                    )}

                    {/* Title */}
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

                    {/* Subtitle */}
                    {subtitle && (
                        <motion.p
                            className="text-lg text-gray-500 max-w-xl mx-auto mb-10"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            style={gpuStyle}
                        >
                            {subtitle}
                        </motion.p>
                    )}

                    {/* CTA Button - Premium Apple style */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        style={gpuStyle}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="inline-block cursor-not-allowed opacity-80">
                                    <Button
                                        size="lg"
                                        className={cn(
                                            "rounded-full px-8 py-6 text-base font-medium",
                                            "bg-gray-900 text-white",
                                            "shadow-lg shadow-gray-900/20",
                                            "pointer-events-none"
                                        )}
                                    >
                                        <span className="gap-1 flex items-center">
                                            {ctaLabel}
                                            <ChevronRight className="w-4 h-4" />
                                        </span>
                                    </Button>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Coming Soon</p>
                            </TooltipContent>
                        </Tooltip>
                    </motion.div>

                    {/* Helper Text */}
                    <motion.p
                        className="mt-4 text-sm text-gray-400/60"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                        style={{ willChange: 'opacity' as const, transform: 'translateZ(0)' }}
                    >
                        Start free. No credit card required.
                    </motion.p>


                    {/* Founder Message */}
                    {showFounderMessage && founder && (
                        <motion.div
                            className="mt-16 flex flex-col items-center"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.6 }}
                            style={gpuStyle}
                        >
                            {founder.avatar ? (
                                <img
                                    src={founder.avatar}
                                    alt={founder.name}
                                    className="w-14 h-14 rounded-full mb-4 ring-4 ring-gray-100"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 mb-4 ring-4 ring-gray-100 flex items-center justify-center text-white text-lg font-semibold">
                                    {founder.name.charAt(0)}
                                </div>
                            )}
                            <p className="text-gray-900 font-medium">
                                Hey, I&apos;m {founder.name} 👋
                            </p>
                            {founder.message && (
                                <p className="text-sm text-gray-500 mt-2 max-w-md">
                                    {founder.message}
                                </p>
                            )}
                        </motion.div>
                    )}
                </div>
            </section>
        </TooltipProvider >
    );
}
