"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Highlighter } from "@/components/ui/highlighter";
import { Download, Shield, Zap, Sparkles, Check } from "lucide-react";

export default function DownloadPage() {
    const ease = [0.22, 1, 0.36, 1] as const;
    const reveal = {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.35, ease },
    };

    const valueProps = [
        {
            icon: Zap,
            title: "Record → Share in minutes",
            description: "Intelligent presets mean your first take is often your final cut.",
        },
        {
            icon: Sparkles,
            title: "Auto-finish built in",
            description: "Zoom effects, cursor styling, and clean exports—with a timeline when you need it.",
        },
        {
            icon: Shield,
            title: "Privacy-first",
            description: "All processing happens locally. Your recordings never leave your Mac.",
        },
    ];

    return (
        <div className="min-h-screen bg-slate-100 relative overflow-x-hidden font-sans selection:bg-slate-900/10">
            <main className="relative mx-auto max-w-5xl px-6 py-12 sm:py-24 lg:py-32">
                {/* Navigation */}
                <motion.div className="mb-12 lg:mb-16" {...reveal}>
                    <Link
                        href="/"
                        className="group inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 shadow-[-5px_-5px_10px_rgba(255,255,255,0.8),5px_5px_10px_rgba(0,0,0,0.1)] transition-all duration-300 hover:text-slate-900 hover:shadow-[-2px_-2px_5px_rgba(255,255,255,0.6),2px_2px_5px_rgba(0,0,0,0.1),inset_-2px_-2px_5px_rgba(255,255,255,0.5),inset_2px_2px_4px_rgba(0,0,0,0.05)] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.1)]"
                    >
                        <svg className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                </motion.div>

                {/* Flattened Grid Layout for Custom Mobile Ordering */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-x-12 lg:gap-x-16 gap-y-12 bg-transparent">

                    {/* 1. Header Section (Logo, Title, Subtitle) */}
                    {/* Mobile: Order 1 (Default) | Desktop: Col 1, Row 1 */}
                    <motion.div
                        className="lg:col-start-1 lg:row-start-1"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease }}
                    >
                        {/* Logo & Title */}
                        <div className="flex items-center gap-4 mb-8">
                            <div className="rounded-[18px] bg-slate-100 p-2 shadow-[-5px_-5px_10px_rgba(255,255,255,0.8),5px_5px_10px_rgba(0,0,0,0.1)]">
                                <Image
                                    src="/brand/bokeh_logo.svg"
                                    alt="bokeh"
                                    width={48}
                                    height={48}
                                    className="h-10 w-auto"
                                    priority
                                />
                            </div>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-slate-800 mb-6 text-balance page-title">
                            Ready to share{" "}
                            <Highlighter action="highlight" style="clean" color="#fde047">finished</Highlighter>{" "}
                            recordings?
                        </h1>

                        <p className="text-[17px] sm:text-[18px] leading-[1.75] text-slate-500 max-w-lg">
                            Join teams who replaced their <Highlighter action="strike-through" style="clean" color="#94a3b8" delay={400}>clunky workflow</Highlighter> with something that{" "}
                            <em className="font-[family-name:var(--font-display)] italic text-slate-700 font-medium">simply performs.</em>
                        </p>
                    </motion.div>

                    {/* 2. Download Card */}
                    {/* Mobile: Order 2 (Visually below Header) | Desktop: Col 2, Row 1-2 (Spans height) */}
                    <motion.div
                        className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 relative lg:self-center"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.1, ease }}
                    >
                        <div className="relative rounded-[40px] bg-slate-100 p-8 sm:p-10 shadow-[-20px_-20px_60px_#ffffff,20px_20px_60px_rgba(0,0,0,0.08)]">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-8">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.8),inset_2px_2px_5px_rgba(0,0,0,0.06)]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    v1.0.0
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-400">
                                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                                        <path d="M16.365 1.43c0 1.14-.43 2.2-1.27 3.05-.86.88-2.16 1.56-3.37 1.46-.15-1.2.43-2.39 1.16-3.2.82-.92 2.17-1.6 3.48-1.31z" />
                                        <path d="M20.16 17.5c-.53 1.22-.78 1.77-1.46 2.85-.95 1.47-2.29 3.31-3.95 3.33-1.48.01-1.86-.98-3.83-.97-1.96.01-2.39.99-3.87.98-1.66-.02-2.93-1.69-3.88-3.16-2.64-4.07-2.92-8.85-1.29-11.34 1.15-1.77 2.96-2.81 4.66-2.81 1.73 0 2.82 1.01 4.25 1.01 1.38 0 2.22-1.01 4.24-1.01 1.51 0 3.11.87 4.26 2.36-3.77 2.07-3.16 7.44.87 8.76z" />
                                    </svg>
                                    macOS
                                </span>
                            </div>

                            {/* Title */}
                            <div className="mb-8 text-center">
                                <div className="w-24 h-24 mx-auto mb-6 rounded-[28px] bg-slate-100 flex items-center justify-center shadow-[-8px_-8px_16px_rgba(255,255,255,1),8px_8px_16px_rgba(0,0,0,0.08)]">
                                    <Image
                                        src="/brand/bokeh_icon.svg"
                                        alt="app icon"
                                        width={64}
                                        height={64}
                                        className="w-14 h-14 drop-shadow-md rounded-xl"
                                    />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-2">bokeh. for Mac</h3>
                                <p className="text-slate-500 text-sm">Apple Silicon required</p>
                            </div>

                            {/* CTA */}
                            <div className="group relative block w-full">
                                <div className="absolute inset-0 rounded-2xl bg-slate-200 blur opacity-50" />
                                <button
                                    type="button"
                                    disabled
                                    className="relative w-full rounded-2xl bg-slate-100 py-4 px-6 text-slate-500 font-semibold text-lg shadow-[-6px_-6px_12px_rgba(255,255,255,0.9),6px_6px_12px_rgba(0,0,0,0.12)] flex items-center justify-center gap-3 cursor-not-allowed"
                                >
                                    <Download className="w-5 h-5" strokeWidth={2.5} />
                                    Coming soon
                                </button>
                            </div>

                            <div className="mt-8 space-y-3">
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 shadow-[-2px_-2px_5px_rgba(255,255,255,0.8),2px_2px_5px_rgba(0,0,0,0.1)]">
                                        <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                                    </div>
                                    <span>Free trial</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 shadow-[-2px_-2px_5px_rgba(255,255,255,0.8),2px_2px_5px_rgba(0,0,0,0.1)]">
                                        <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                                    </div>
                                    <span>No credit card required</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 shadow-[-2px_-2px_5px_rgba(255,255,255,0.8),2px_2px_5px_rgba(0,0,0,0.1)]">
                                        <Check className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                                    </div>
                                    <span>Auto-updates handling</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* 3. Value Props Section */}
                    {/* Mobile: Order 3 (Below Card) | Desktop: Col 1, Row 2 */}
                    <div className="order-3 lg:order-none lg:col-start-1 lg:row-start-2">
                        <div className="grid gap-8">
                            {valueProps.map((prop, i) => (
                                <motion.div
                                    key={i}
                                    className="flex gap-4"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35, delay: 0.15 + i * 0.08, ease }}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 shadow-[-4px_-4px_8px_rgba(255,255,255,0.8),4px_4px_8px_rgba(0,0,0,0.1)]">
                                            <prop.icon className="w-5 h-5" strokeWidth={1.5} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-semibold text-slate-800 mb-1">{prop.title}</p>
                                        <p className="text-[15px] text-slate-500 leading-relaxed max-w-sm">{prop.description}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <motion.div
                    className="mt-24 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.35, ease }}
                >
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400 mb-6 font-medium">
                        <Link href="/changelog" className="hover:text-slate-600 transition-colors">Changelog</Link>
                        <span className="text-slate-300">·</span>
                        <Link href="/roadmap" className="hover:text-slate-600 transition-colors">Roadmap</Link>
                        <span className="text-slate-300">·</span>
                        <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}
