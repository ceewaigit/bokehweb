"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { useState } from "react";

interface QAItem {
    question: string;
    answer: string;
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
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const fadeInStyle = { opacity: 0 };

    return (
        <section id={id} className={cn("relative py-24 px-6 overflow-hidden", className)}>
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
                            style={fadeInStyle}
                        >
                            {eyebrow}
                        </motion.p>
                        <motion.h2
                            className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-foreground text-balance font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-primary"
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                            style={fadeInStyle}
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
                                style={fadeInStyle}
                            >
                                {subtitle}
                            </motion.p>
                        )}
                    </div>

                    {/* Scrollable FAQ container with fade masks */}
                    <div className="relative">
                        {/* Scrollable container with CSS mask for fade effect */}
                        <div
                            className={cn(
                                "max-h-[400px] md:max-h-[520px] overflow-y-auto space-y-3 py-4 -mx-4 px-4",
                                "scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                            )}
                            style={{
                                maskImage: "linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 32px), transparent 100%)",
                                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 32px), transparent 100%)",
                            }}
                        >
                            {items.map((item, index) => {
                                const isOpen = openIndex === index;

                                return (
                                    <motion.div
                                        key={item.question}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl bg-white/90 cursor-pointer",
                                            "shadow-[0_2px_8px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]",
                                            "border border-slate-100/80",
                                            "transition-[background-color,box-shadow] duration-150 ease-out",
                                            "hover:bg-white hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]",
                                            "active:bg-slate-50"
                                        )}
                                        initial={{ opacity: 0, y: 8 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-40px" }}
                                        transition={{ duration: 0.3, delay: Math.min(index * 0.02, 0.15) }}
                                        onClick={() => setOpenIndex(isOpen ? null : index)}
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={isOpen}
                                            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-slate-900 outline-none focus-visible:outline-none focus-visible:ring-0 pointer-events-none"
                                        >
                                            <span>{item.question}</span>
                                            <span
                                                className={cn(
                                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500 border border-slate-100",
                                                    "transition-transform duration-150 ease-out",
                                                    isOpen && "rotate-45"
                                                )}
                                            >
                                                +
                                            </span>
                                        </button>
                                        <div
                                            className={cn(
                                                "grid transition-[grid-template-rows] duration-150 ease-out",
                                                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                            )}
                                        >
                                            <div className="overflow-hidden">
                                                <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
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
