"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { HighlightText } from "@/components/ui/highlight-text";
import { SectionBackdrop } from "@/components/ui/section-backdrop";

export default function AboutPage() {
    const ease = [0.22, 1, 0.36, 1] as const;
    const reveal = {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.35, ease },
    };

    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            {/* Artistic Background - Matching Roadmap/Changelog */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-50/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute inset-0 opacity-40 texture-mesh" />
                <div className="absolute inset-0 opacity-[0.08] texture-grid" />
                <div className="absolute inset-0 opacity-[0.08] texture-dots-fade" />
                <div className="absolute inset-0 opacity-[0.04] mix-blend-multiply">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(120deg,rgba(15,23,42,0.25)_0,rgba(15,23,42,0.25)_1px,transparent_1px,transparent_22px)]" />
                </div>
            </div>

            <main className="relative mx-auto max-w-4xl px-6 py-24 sm:py-32 [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-800">
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <SectionBackdrop variant="dots" texture fade="all" className="opacity-40" />
                    <SectionBackdrop variant="shimmer" fade="all" className="opacity-30" />
                    <div className="absolute inset-0 opacity-[0.05]">
                        <div className="absolute inset-0 texture-fine-lines" />
                    </div>
                    <svg
                        className="absolute left-1/2 top-0 h-full w-6 -translate-x-1/2 text-slate-200/80"
                        viewBox="0 0 24 800"
                        fill="none"
                        preserveAspectRatio="none"
                    >
                        <path
                            d="M12 0 C 12 140, 10 220, 12 320 C 14 420, 12 520, 12 640 C 12 720, 12 780, 12 800"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeLinecap="round"
                        />
                        <path
                            d="M12 392 C 20 392, 20 408, 12 408 C 4 408, 4 392, 12 392"
                            stroke="currentColor"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div
                        className="absolute -top-20 right-[-12%] h-[320px] w-[320px] rounded-full opacity-60 blur-[60px]"
                        style={{ background: "radial-gradient(circle, rgba(250,204,21,0.18) 0%, transparent 70%)" }}
                    />
                    <div
                        className="absolute bottom-[-15%] left-[8%] h-[360px] w-[360px] rounded-full opacity-50 blur-[70px]"
                        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 72%)" }}
                    />
                </div>
                {/* Navigation */}
                <motion.div className="mb-14 text-center" {...reveal}>
                    <Link
                        href="/"
                        className="group inline-flex items-center text-[13px] font-medium text-slate-500 hover:text-slate-900 mb-8 transition-colors tracking-wide"
                    >
                        <svg className="mr-2 h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back home
                    </Link>
                    <h1 className="text-4xl font-semibold tracking-[-0.02em] leading-[1.05] font-[family-name:var(--font-display)] text-slate-900 sm:text-6xl sm:leading-[1.02] mb-6 text-balance">
                        Screen recordings that feel calm, <HighlightText variant="yellow">clear,</HighlightText> and{" "}
                        <em className="font-[family-name:var(--font-display)] italic not-italic sm:italic text-slate-800">complete</em>.
                    </h1>
                    <p className="text-[18px] sm:text-[19px] leading-[1.75] text-slate-500 max-w-2xl mx-auto text-balance">
                        We built bokeh. for people who need{" "}
                        <em className="font-[family-name:var(--font-display)] italic text-slate-700">fast, polished</em> updates without the heavy edit.
                    </p>
                    <div className="mt-10 flex justify-center">
                        <svg className="h-6 w-48 text-slate-300/80" viewBox="0 0 200 24" fill="none">
                            <path
                                d="M2 14 C 40 6, 80 20, 120 10 C 150 4, 176 12, 198 8"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                </motion.div>

                <div className="space-y-16 sm:space-y-24">
                    {/* Story Section */}
                    <motion.div className="relative" {...reveal}>
                        <div className="relative aspect-[16/9] w-[80%] mx-auto overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm mb-12 group transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)]">
                            <Image
                                src="/brand/aboutus.jpg"
                                alt="Bokeh workspace"
                                fill
                                className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.01]"
                                sizes="896px, 100vw"
                                priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/10" />
                        </div>

                        <div className="prose prose-slate prose-lg max-w-none px-2 sm:px-6 prose-em:font-[family-name:var(--font-display)] prose-em:italic prose-strong:font-semibold prose-strong:text-slate-800">
                            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-[-0.015em] font-display mb-6">
                                The Story
                            </h2>
                            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.85] max-w-3xl">
                                bokeh. started as a small tool we made for friends working on projects together. We wanted recordings that looked clean without hours of editing, and something we could trust to work every time.
                            </p>
                            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.85] max-w-3xl mt-6">
                                We also noticed most people just hit the default screen recorder. It is easy, but the text comes out soft and hard to read, and they assume that is just how screen video looks. The better tools existed, but they were hidden behind heavy workflows or a steep price. We wanted to fill that gap with something simple: <strong>crisp capture</strong>, clean exports, and no learning curve.
                            </p>
                            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.85] max-w-3xl mt-6">
                                The real cost was not just time. It was hesitation: the moment you decide not to record because it is going to take too long. We focused on getting from recording to shareable in one smooth pass, with thoughtful defaults that make the output feel finished without another round of edits.
                            </p>
                            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.85] max-w-3xl mt-6">
                                So we built something that just works: smart defaults, calm motion, and clean exports without a complicated timeline. After we shared it, friends and even our bosses kept asking for it. That was the moment it felt bigger than a <em>private tool</em>.
                            </p>
                            <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.85] max-w-3xl mt-6">
                                Today, bokeh. is for professionals shipping product updates, support walkthroughs, and training. The goal is quiet confidence: you press record, you ship, and your audience gets the message without the noise.
                            </p>
                            <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/70">
                                    ↘
                                </span>
                                <span>Designed for the simple case that happens every day.</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Philosophy Section */}
                    <motion.div className="pt-16 border-t border-slate-100" {...reveal}>
                        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-[-0.015em] font-display mb-4">
                                    How we think about the product
                                </h2>
                                <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.75]">
                                    We keep bokeh. small on purpose. The focus is on the moments that make a recording feel <em>finished</em>, not on adding knobs for everything else.
                                </p>
                                <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                                    <div className="absolute inset-0 opacity-35 texture-fine-lines" />
                                    <div className="relative z-10">
                                        “Quiet software that stays out of the way.”
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                    {
                                        title: "Clarity",
                                        description: "Remove the clutter so the idea stands out.",
                                    },
                                    {
                                        title: "Restraint",
                                        description: "Fewer choices, better defaults, calmer output.",
                                    },
                                    {
                                        title: "Tempo",
                                        description: "A recording that moves at the right pace.",
                                    },
                                    {
                                        title: "Trust",
                                        description: "Dependable capture with clean, predictable exports.",
                                    },
                                ].map((value, i) => (
                                    <div
                                        key={i}
                                        className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/70 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition-all duration-300 hover:border-slate-200 hover:bg-white"
                                    >
                                        <div className="absolute inset-0 opacity-35">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.05)_1px,transparent_0)] [background-size:24px_24px]" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{`0${i + 1}`}</div>
                                            <h3 className="mt-2 text-base font-semibold text-slate-900">{value.title}</h3>
                                            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{value.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Feature Growth Section */}
                    <motion.div className="pt-16 border-t border-slate-100" {...reveal}>
                        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-[-0.015em] font-display mb-4">
                                    How we grow the feature set
                                </h2>
                                <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.75]">
                                    We keep the core experience steady and fast, then add depth in layers so you never feel buried. That lets you keep the essentials in muscle memory while still getting new capabilities when you need them.
                                </p>
                                <p className="text-[17px] sm:text-[18px] text-slate-600 leading-[1.75] mt-4">
                                    Every new feature must reduce steps, not add them. If it cannot stay <em>quiet</em> by default, it does not ship.
                                </p>
                            </div>
                            <div className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                                <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-slate-50/70" />
                                <div className="absolute inset-0 opacity-25">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.05)_1px,transparent_0)] [background-size:22px_22px]" />
                                </div>
                                <div className="relative z-10">
                                    {[
                                        {
                                            title: "Core",
                                            description: (
                                                <>
                                                    The essentials we keep simple so every recording feels clean and ready to share.
                                                </>
                                            ),
                                        },
                                        {
                                            title: "Extras",
                                            description: (
                                                <>
                                                    Optional tools you can turn on when you want a touch more <em>polish</em>.
                                                </>
                                            ),
                                        },
                                        {
                                            title: "Workflow",
                                            description: (
                                                <>
                                                    Small team touches that make sharing and feedback feel <em>effortless</em>.
                                                </>
                                            ),
                                        },
                                    ].map((tier, i, arr) => (
                                        <div
                                            key={tier.title}
                                            className={`group flex items-start gap-4 px-6 py-5 transition-all duration-200 ease-out hover:bg-white/70 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] ${i < arr.length - 1 ? "border-b border-slate-200/70" : ""}`}
                                        >
                                            <div className="mt-2 h-2.5 w-2.5 rounded-full bg-slate-300/70 shadow-[0_0_0_6px_rgba(148,163,184,0.12)] transition-transform duration-200 ease-out group-hover:scale-110" />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="text-base font-semibold text-slate-900">{tier.title}</h3>
                                                </div>
                                                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{tier.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
