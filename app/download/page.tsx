"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { Button } from "@/components/ui/button";
import { HighlightText } from "@/components/ui/highlight-text";
import { Download, Shield, Zap, Sparkles } from "lucide-react";

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
            description: "Smart defaults mean your first take is often your final cut.",
        },
        {
            icon: Sparkles,
            title: "Auto-polish built in",
            description: "Zoom effects, cursor styling, and clean exports—no timeline needed.",
        },
        {
            icon: Shield,
            title: "Privacy-first",
            description: "All processing happens locally. Your recordings never leave your Mac.",
        },
    ];

    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            {/* Artistic Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-amber-50/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-slate-100/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute inset-0 opacity-40 texture-mesh" />
                <div className="absolute inset-0 opacity-[0.08] texture-grid" />
                <div className="absolute inset-0 opacity-[0.08] texture-dots-fade" />
                <div className="absolute inset-0 opacity-[0.04] mix-blend-multiply">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(120deg,rgba(15,23,42,0.25)_0,rgba(15,23,42,0.25)_1px,transparent_1px,transparent_22px)]" />
                </div>
            </div>

            {/* Edge Fades */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#FBFBFD] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#FBFBFD] to-transparent" />
                <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#FBFBFD] to-transparent" />
                <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#FBFBFD] to-transparent" />
            </div>

            <main className="relative mx-auto max-w-5xl px-6 py-24 sm:py-32">
                {/* Backdrop */}
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <SectionBackdrop variant="dots" texture fade="all" className="opacity-40" />
                    <SectionBackdrop variant="shimmer" fade="all" className="opacity-30" />
                    <div className="absolute inset-0 opacity-[0.05] texture-fine-lines" />
                    <div
                        className="absolute -top-20 left-[-8%] h-[280px] w-[280px] rounded-full opacity-50 blur-[60px]"
                        style={{ background: "radial-gradient(circle, rgba(250,204,21,0.2) 0%, transparent 70%)" }}
                    />
                </div>

                {/* Navigation */}
                <motion.div className="mb-16" {...reveal}>
                    <Link
                        href="/"
                        className="group inline-flex items-center text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors tracking-wide"
                    >
                        <svg className="mr-2 h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back home
                    </Link>
                </motion.div>

                {/* Dual Column Layout */}
                <div className="grid items-start gap-12 lg:gap-16 lg:grid-cols-[1.15fr_0.85fr]">
                    {/* Left Column - Why Download */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease }}
                    >
                        {/* Logo & Title */}
                        <div className="flex items-center gap-4 mb-8">
                            <Image
                                src="/brand/bokeh_logo.svg"
                                alt="bokeh"
                                width={56}
                                height={56}
                                className="h-12 w-auto"
                                priority
                            />
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-[-0.02em] leading-[1.08] font-[family-name:var(--font-display)] text-slate-900 mb-6 text-balance">
                            Ready to ship{" "}
                            <HighlightText variant="yellow">polished</HighlightText>{" "}
                            recordings?
                        </h1>

                        <p className="text-[17px] sm:text-[18px] leading-[1.75] text-slate-500 max-w-lg mb-10">
                            Join teams who replaced their clunky workflow with something that{" "}
                            <em className="font-[family-name:var(--font-display)] italic text-slate-600">just works.</em>
                        </p>

                        {/* Value Props */}
                        <div className="space-y-6">
                            {valueProps.map((prop, i) => (
                                <motion.div
                                    key={i}
                                    className="flex gap-4"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35, delay: 0.15 + i * 0.08, ease }}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100/80 border border-slate-200/60">
                                            <prop.icon className="w-4 h-4 text-slate-500" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-medium text-slate-800">{prop.title}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">{prop.description}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Decorative */}
                        <div className="mt-12">
                            <svg className="h-5 w-32 text-slate-300/80" viewBox="0 0 128 20" fill="none">
                                <path d="M2 12 C 24 4, 48 18, 72 10 C 96 4, 112 12, 126 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                        </div>
                    </motion.div>

                    {/* Right Column - Download Card */}
                    <motion.div
                        className="relative lg:sticky lg:top-24"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1, ease }}
                    >
                        <div className="absolute -inset-4 rounded-[36px] bg-gradient-to-b from-white/50 via-transparent to-white/20 blur-2xl" />

                        <div className="group relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/80 backdrop-blur-sm shadow-[0_20px_50px_rgba(15,23,42,0.1)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-50/70" />
                            <div className="absolute inset-0 opacity-[0.06] texture-sheen" />
                            <div className="absolute inset-0 opacity-25">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.04)_1px,transparent_0)] [background-size:20px_20px]" />
                            </div>
                            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(ellipse_80%_60%_at_20%_0%,rgba(251,191,36,0.06),transparent_55%)]" />

                            <div className="relative z-10 p-8 sm:p-10">
                                {/* Header */}
                                <div className="flex items-center gap-2.5 mb-8">
                                    <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white">
                                        macOS
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
                                        Free trial
                                    </span>
                                </div>

                                {/* Title */}
                                <p className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                                    bokeh for Mac
                                </p>
                                <p className="text-sm text-slate-500 mb-8">
                                    Apple Silicon · No credit card required
                                </p>

                                {/* CTA */}
                                <Button
                                    asChild
                                    size="lg"
                                    className="w-full rounded-2xl h-14 text-base font-medium text-white shadow-[0_14px_36px_rgba(15,23,42,0.2)] bg-slate-900 hover:bg-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.25)]"
                                >
                                    <a href="#" className="flex items-center justify-center gap-3">
                                        <Download className="w-5 h-5" />
                                        Download now
                                    </a>
                                </Button>

                                {/* Trust line */}
                                <p className="text-center text-xs text-slate-400 mt-5">
                                    ~150 MB · v1.0.0 · Auto-updates included
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Footer */}
                <motion.div
                    className="mt-24 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.35, ease }}
                >
                    <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400 mb-6">
                        <Link href="/changelog" className="hover:text-slate-600 transition-colors">Changelog</Link>
                        <span className="text-slate-200">·</span>
                        <Link href="/roadmap" className="hover:text-slate-600 transition-colors">Roadmap</Link>
                        <span className="text-slate-200">·</span>
                        <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
                    </div>
                    <p className="text-xs text-slate-400">
                        By downloading, you agree to our{" "}
                        <Link href="/terms" className="underline underline-offset-2 hover:text-slate-600 transition-colors">Terms of Service</Link>
                    </p>
                </motion.div>
            </main>
        </div>
    );
}
