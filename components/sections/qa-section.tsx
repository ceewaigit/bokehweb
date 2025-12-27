"use client";

import { cn } from "@/lib/utils";
import { gpuAccelerated } from "@/lib/animation-utils";
import { motion, AnimatePresence } from "framer-motion";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { useState } from "react";
import { Highlighter } from "@/components/ui/highlighter";

interface QAItem {
    question: string;
    answer: React.ReactNode;
}

interface QASectionProps {
    className?: string;
    id?: string;
    eyebrow?: string;
    title: React.ReactNode;
    subtitle?: string;
    items: QAItem[];
}

export function QASection({
    className,
    id,
    eyebrow = "Questions",
    title,
    subtitle,
    items,
}: QASectionProps) {
    // Add pronunciation guide as the first item if not already present
    // This is a temporary way to inject it, ideally it should come from the prop
    const updatedItems = [
        {
            question: <>How do you pronounce <Highlighter action="box" color="#cbd5e1" style="rough" delay={400}>bokeh</Highlighter>?</>,
            answer: "We usually say BOH-keh. But don't stress about it! We've heard 'bouquet' (like flowers) and 'bow-kuh' too. However you say it, you're speaking our language.",
        },
        ...items
    ];

    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section id={id} className={cn("relative py-24 px-6 overflow-hidden bg-slate-50/50", className)}>
            <SectionBackdrop variant="plus" texture fade="all" className="opacity-40" />

            <div className="mx-auto max-w-6xl">
                <div className="grid gap-12 lg:grid-cols-[1.1fr_1.4fr]">
                    <div>
                        <motion.p
                            className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-4"
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                            style={gpuAccelerated}
                        >
                            {eyebrow}
                        </motion.p>
                        <motion.h2
                            className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-foreground text-balance font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-primary"
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            style={gpuAccelerated}
                        >
                            {title}
                        </motion.h2>
                        {subtitle && (
                            <motion.p
                                className="mt-5 text-lg text-muted-foreground max-w-lg"
                                initial={{ opacity: 0, y: 14 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: 0.1 }}
                                style={gpuAccelerated}
                            >
                                {subtitle}
                            </motion.p>
                        )}
                    </div>

                    {/* Scrollable FAQ container with fade masks */}
                    <div className="relative">
                        {/* Top fade mask */}
                        <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-slate-50/90 to-transparent z-10" />
                        {/* Bottom fade mask */}
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-slate-50/90 to-transparent z-10" />

                        {/* Scrollable container */}
                        <div
                            className={cn(
                                "max-h-[600px] overflow-y-auto space-y-4 py-6 px-4 -mx-4",
                                "scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                            )}
                        >
                            {updatedItems.map((item, index) => {
                                const isOpen = openIndex === index;

                                return (
                                    <motion.div
                                        key={index}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl cursor-pointer bg-slate-100",
                                            "transition-all duration-300 ease-out",
                                            isOpen
                                                ? "shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.06)]"
                                                : "shadow-[-5px_-5px_10px_rgba(255,255,255,0.9),5px_5px_10px_rgba(0,0,0,0.05)] hover:shadow-[-2px_-2px_5px_rgba(255,255,255,0.5),2px_2px_5px_rgba(0,0,0,0.05)]"
                                        )}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-20px" }}
                                        transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.15), layout: { duration: 0.2 } }}
                                        style={gpuAccelerated}
                                        onClick={() => setOpenIndex(isOpen ? null : index)}
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={isOpen}
                                            className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left text-[15px] font-semibold text-slate-800 outline-none focus-visible:outline-none focus-visible:ring-0 pointer-events-none"
                                        >
                                            <span>{item.question}</span>
                                            <span
                                                className={cn(
                                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500",
                                                    "transition-all duration-300 ease-out",
                                                    isOpen
                                                        ? "rotate-45 shadow-[inset_-2px_-2px_4px_rgba(255,255,255,0.8),inset_2px_2px_4px_rgba(0,0,0,0.05)] text-violet-500"
                                                        : "shadow-[-2px_-2px_5px_rgba(255,255,255,0.9),2px_2px_5px_rgba(0,0,0,0.1)]"
                                                )}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </span>
                                        </button>
                                        <div
                                            className={cn(
                                                "grid transition-[grid-template-rows] duration-300 ease-out",
                                                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                            )}
                                        >
                                            <div className="overflow-hidden">
                                                <div className="px-6 pb-6 text-[15px] text-slate-600 leading-relaxed max-w-[90%]">
                                                    {item.answer}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
