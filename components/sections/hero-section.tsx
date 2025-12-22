"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HandArrow } from "@/components/ui/hand-arrow";

import Image from "next/image";
import { Play, ChevronRight } from "lucide-react";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeroSectionProps {
    className?: string;
    badge?: string;
    brandMarkSrc?: string;
    brandMarkAlt?: string;
    title: React.ReactNode;
    subtitle: string;
    primaryCta?: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
    screenshotSrc?: string;
    socialProof?: { count: string; label: string };
}

export function HeroSection({
    className,
    badge,
    brandMarkSrc,
    brandMarkAlt = "Brand mark",
    title,
    subtitle,
    primaryCta = { label: "Get started", href: "#" },
    secondaryCta,
    screenshotSrc,
    socialProof = { count: "10,000+", label: "people shipping with bokeh" },
}: HeroSectionProps) {
    return (
        <TooltipProvider delayDuration={0}>
            <section
                className={cn(
                    "relative flex flex-col items-center overflow-hidden",
                    "pt-24 sm:pt-28 md:pt-32 lg:pt-36 pb-16 sm:pb-20 lg:pb-24 px-4 sm:px-6",
                    className
                )}
            >
                {/* Texture Cloud Background */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none sticky top-0">
                    {/* Noise Texture */}
                    <div
                        className="absolute inset-0 z-20 opacity-[0.05] mix-blend-multiply"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
                        }}
                    />

                    {/* Gradient Clouds */}
                    <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[140%] h-[100%] opacity-100">
                        {/* Center bright cloud */}
                        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[70%] h-[60%] rounded-[50%] bg-[#F0F4FF] blur-[80px] sm:blur-[100px]" />

                        {/* Left soft warm cloud */}
                        <div className="absolute top-[0%] left-[10%] w-[60%] h-[70%] rounded-[50%] bg-gradient-to-br from-indigo-300/40 to-purple-300/40 blur-[90px] sm:blur-[130px]" />

                        {/* Right soft cool cloud */}
                        <div className="absolute top-[5%] right-[5%] w-[60%] h-[70%] rounded-[50%] bg-gradient-to-bl from-blue-300/40 to-cyan-300/40 blur-[90px] sm:blur-[130px]" />

                        {/* Bottom fade out mask */}
                        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-white via-white/90 to-transparent" />
                    </div>
                </div>


                <div className="relative z-20 mx-auto max-w-4xl text-center flex flex-col items-center">
                    {brandMarkSrc && (
                        <motion.div
                            className="mb-2 flex justify-center hover:scale-105 transition-all duration-300 hover:rotate-4"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.05, ease: [0.22, 1, 0.36, 1] }}
                            style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                        >
                            <Image
                                src={brandMarkSrc}
                                alt={brandMarkAlt}
                                width={160}
                                height={48}
                                className="h-11 w-auto drop-shadow-sm"
                                priority
                            />
                        </motion.div>
                    )}

                    {/* Badge */}
                    {badge && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="relative inline-block"
                            style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                        >
                            <Badge
                                variant="outline"
                                className="mb-2 backdrop-blur"
                            >
                                {badge}
                            </Badge>
                        </motion.div>
                    )}

                    {/* Title */}
                    <motion.h1
                        className={cn(
                            "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.02] text-foreground mb-6",
                            "tracking-[-0.02em] [text-wrap:balance] font-[family-name:var(--font-display)]",
                            "[&_em]:italic [&_em]:font-medium [&_em]:text-primary"
                        )}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                    >
                        {title}
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                    >
                        {subtitle}
                    </motion.p>

                    {/* CTAs - Apple-style buttons */}
                    <motion.div
                        className="flex flex-row items-center justify-center gap-2 sm:gap-4 mb-4"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="relative cursor-not-allowed opacity-80">
                                    <Button
                                        size="lg"
                                        className={cn(
                                            "rounded-full px-4 py-4 sm:px-8 sm:py-6 text-sm sm:text-base font-medium",
                                            "bg-primary text-primary-foreground",
                                            "shadow-[var(--shadow-lg)]",
                                            "pointer-events-none"
                                        )}
                                    >
                                        <span className="gap-1 flex items-center">
                                            {primaryCta.label}
                                            <ChevronRight className="w-4 h-4" />
                                        </span>
                                    </Button>
                                    <div className="absolute -top-8 -left-20 hidden md:block pointer-events-none">
                                        <HandArrow
                                            direction="down-right"
                                            size="md"
                                            delay={0.6}
                                            className="text-foreground/20 rotate-[300deg] scale-x-[-1]"
                                        />
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Coming Soon</p>
                            </TooltipContent>
                        </Tooltip>

                        {secondaryCta && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="cursor-not-allowed opacity-80">
                                        <Button
                                            variant="ghost"
                                            size="lg"
                                            className="rounded-full px-4 py-4 sm:px-8 sm:py-6 text-sm sm:text-base text-foreground/80 gap-2 pointer-events-none"
                                        >
                                            <Play className="w-4 h-4 fill-current" />
                                            {secondaryCta.label}
                                        </Button>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Coming Soon</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </motion.div>

                    {/* Free trial text */}
                    <motion.p
                        className="text-sm text-muted-foreground/60 mb-8 sm:mb-10 lg:mb-12"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
                    >
                        Free trial • No credit card required
                    </motion.p>
                </div>

                {screenshotSrc && (
                    <motion.div
                        className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 mt-4 sm:mt-6"
                        initial={{ opacity: 0, y: 40, scale: 0.98 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                    >
                        {/* Glow effect behind the frame */}
                        <div
                            className="absolute inset-0 -z-10 rounded-2xl blur-2xl opacity-20"
                        />
                        {/* Native App Window Frame - No Header, Glass Border */}
                        <div className="relative rounded-lg sm:rounded-xl border border-slate-200/60 bg-slate-900/5 backdrop-blur-sm shadow-[0_20px_60px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden p-1.5 sm:p-2 md:p-3">
                            {/* Window Content */}
                            <div className="relative rounded-md sm:rounded-lg overflow-hidden border border-black/5 shadow-sm">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="relative cursor-not-allowed">
                                            <Image
                                                src={screenshotSrc}
                                                alt="App screenshot"
                                                width={1920}
                                                height={1080}
                                                className="w-full h-auto opacity-100 block"
                                                priority
                                            />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Coming Soon</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    </motion.div>
                )}
            </section>
        </TooltipProvider>
    );
}
