"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useState } from "react";

interface QAItem {
    question: string;
    answer: string;
}

interface QASectionProps {
    className?: string;
    eyebrow?: string;
    title: React.ReactNode;
    subtitle?: string;
    items: QAItem[];
}

export function QASection({
    className,
    eyebrow = "Questions",
    title,
    subtitle,
    items,
}: QASectionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section className={cn("py-24 px-6", className)}>
            <div className="mx-auto max-w-6xl">
                <div className="grid gap-12 lg:grid-cols-[1.1fr_1.4fr]">
                    <div>
                        <motion.p
                            className="text-xs uppercase tracking-[0.28em] text-muted-foreground mb-4"
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4 }}
                        >
                            {eyebrow}
                        </motion.p>
                        <motion.h2
                            className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.05] text-foreground text-balance font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-primary"
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
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
                            >
                                {subtitle}
                            </motion.p>
                        )}
                    </div>

                    <div className="space-y-3">
                        {items.map((item, index) => {
                            const isOpen = openIndex === index;

                            return (
                                <motion.div
                                    key={item.question}
                                    className={cn(
                                        "relative overflow-hidden rounded-2xl bg-white/80",
                                        "backdrop-blur-lg shadow-[0_8px_24px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.95)_inset]"
                                    )}
                                    initial={{ opacity: 0, y: 6 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: "-60px" }}
                                    transition={{ duration: 0.22, delay: index * 0.03, ease: [0.22, 0.61, 0.36, 1] }}
                                >
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenIndex(isOpen ? null : index)}
                                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-slate-900 outline-none focus-visible:outline-none focus-visible:ring-0"
                                    >
                                        <span>{item.question}</span>
                                        <span
                                            className={cn(
                                                "flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-500",
                                                "shadow-[0_6px_16px_rgba(15,23,42,0.12)] transition-transform duration-150",
                                                isOpen ? "rotate-45" : "rotate-0"
                                            )}
                                        >
                                            +
                                        </span>
                                    </button>
                                    <div
                                        className={cn(
                                            "grid transition-[grid-template-rows,opacity] duration-150 ease-out",
                                            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
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
        </section>
    );
}
