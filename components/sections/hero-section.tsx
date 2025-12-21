"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HandArrow } from "@/components/ui/hand-arrow";
import { BrowserFrame } from "@/components/ui/browser-frame";
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
    socialProof = { count: "10,000+", label: "teams already recording with bokeh" },
}: HeroSectionProps) {
    return (
        <TooltipProvider delayDuration={0}>
            <section
                className={cn(
                    "relative h-screen flex flex-col items-center overflow-visible",
                    "pt-24 pb-10 px-6",
                    className
                )}
            >

                <div className="mx-auto max-w-4xl text-center flex-1 flex flex-col justify-center translate-y-0 lg:-translate-y-32 transition-transform duration-700">
                    {brandMarkSrc && (
                        <motion.div
                            className="mb-2 flex justify-center hover:scale-105 transition-all duration-300 hover:rotate-4"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
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
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="relative inline-block"
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
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        {title}
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        {subtitle}
                    </motion.p>

                    {/* CTAs - Apple-style buttons */}
                    <motion.div
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="relative cursor-not-allowed opacity-80">
                                    <Button
                                        size="lg"
                                        className={cn(
                                            "rounded-full px-8 py-6 text-base font-medium",
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
                                            className="rounded-full px-8 py-6 text-base text-foreground/80 gap-2 pointer-events-none"
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
                        className="text-sm text-muted-foreground/60 mb-12"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                    >
                        Free trial • No credit card required
                    </motion.p>
                </div>

                {/* Preview half-visible on load */}
                {screenshotSrc && (
                    <motion.div
                        className="absolute bottom-0 left-1/2 w-full max-w-6xl -translate-x-1/2 translate-y-[10%] md:translate-y-[30%] px-6 z-10"
                        initial={{ opacity: 0, y: 80, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        {/* Glow effect behind the frame */}
                        <div
                            className="absolute inset-0 -z-10 rounded-3xl blur-3xl opacity-30"
                        // style={{
                        //     background:
                        //         "radial-gradient(ellipse at center, hsla(var(--primary), 0.22) 0%, transparent 70%)",
                        // }}
                        />
                        {/* For now disabled for photo */}
                        {/* <BrowserFrame
                            variant="light"
                            className="shadow-[0_40px_120px_rgba(15,23,42,0.16),0_12px_32px_rgba(15,23,42,0.08)]"
                        > */}
                        <div className="relative">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="relative cursor-not-allowed">
                                        <Image
                                            src={screenshotSrc}
                                            alt="App screenshot"
                                            width={1920}
                                            height={1080}
                                            className="w-full h-auto opacity-90"
                                            priority
                                        />
                                        <div className="absolute inset-0 bg-transparent" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Coming Soon</p>
                                </TooltipContent>
                            </Tooltip>
                            {/* <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 bg-black/5">
                                <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                    <Play className="w-5 h-5 text-gray-900 ml-0.5 fill-current" />
                                </div>
                            </div> */}
                        </div>
                        {/* </BrowserFrame> */}
                    </motion.div>
                )}
            </section>
        </TooltipProvider>
    );
}
