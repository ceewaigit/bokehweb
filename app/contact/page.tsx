import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionBackdrop } from "@/components/ui/section-backdrop";

export default function ContactPage() {
    return (
        <div className="relative min-h-screen overflow-hidden page-backdrop">
            <SectionBackdrop variant="shimmer" texture fade="all" className="opacity-70" />

            <div
                className="gradient-orb h-[420px] w-[420px] left-[-6%] top-[6vh]"
                style={{ background: "radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 65%)" }}
            />
            <div
                className="gradient-orb h-[380px] w-[380px] right-[-6%] top-[12vh]"
                style={{ background: "radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 65%)" }}
            />
            <div
                className="gradient-orb h-[360px] w-[360px] left-[12%] top-[65vh]"
                style={{ background: "radial-gradient(circle, rgba(251, 191, 36, 0.08) 0%, transparent 68%)" }}
            />

            <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
                <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        Contact
                    </p>
                    <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl font-sans [text-wrap:balance] [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-orange-300">
                        Talk to us when you need a steady hand <em>and a clear answer.</em>
                    </h1>
                    <p className="mt-4 text-[17px] leading-relaxed text-gray-500 max-w-xl">
                        We keep it simple and helpful. Send a note and we will get back within one business day.
                    </p>
                </div>

                <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                    <GlassCard variant="subtle" hover={false} className="rounded-3xl border border-gray-200/70 bg-white/70 px-8 py-8 md:px-10 md:py-10 shadow-[0_10px_40px_rgba(15,23,42,0.08)]">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Send a note</h2>
                                <p className="mt-1 text-[13px] text-gray-500">We reply within one business day.</p>
                            </div>
                            <span className="rounded-full bg-gray-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                                Support
                            </span>
                        </div>

                        <form className="mt-8 space-y-5">
                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-gray-400">Name</span>
                                    <input
                                        type="text"
                                        placeholder="Avery Chen"
                                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-gray-400">Email</span>
                                    <input
                                        type="email"
                                        placeholder="you@studio.com"
                                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                    />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-gray-400">How can we help?</span>
                                <textarea
                                    rows={5}
                                    placeholder="Tell us what you are working on and what you need."
                                    className="mt-2 w-full resize-none rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                />
                            </label>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-[12px] text-gray-400">For account issues, include your bokeh email.</p>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-3 text-[13px] font-semibold tracking-[-0.01em] text-white shadow-sm transition-all duration-200 hover:bg-gray-800 hover:shadow-md active:scale-[0.98]"
                                >
                                    Send message
                                </button>
                            </div>
                        </form>
                    </GlassCard>

                    <div className="space-y-6">
                        <GlassCard variant="subtle" hover={false} className="rounded-3xl border border-gray-200/70 bg-white/60 px-8 py-7 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Direct lines</h3>
                            <div className="mt-5 space-y-4 text-sm text-gray-600">
                                <div className="flex items-center justify-between">
                                    <span>Support</span>
                                    <Link href="mailto:support@bokeh.app" className="text-gray-900 hover:text-gray-700">
                                        support@bokeh.app
                                    </Link>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Sales</span>
                                    <Link href="mailto:sales@bokeh.app" className="text-gray-900 hover:text-gray-700">
                                        sales@bokeh.app
                                    </Link>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Security</span>
                                    <Link href="mailto:security@bokeh.app" className="text-gray-900 hover:text-gray-700">
                                        security@bokeh.app
                                    </Link>
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard variant="subtle" hover={false} className="rounded-3xl border border-gray-200/70 bg-white/60 px-8 py-7 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">What we handle</h3>
                            <div className="mt-5 space-y-3 text-sm text-gray-600">
                                <p>Product questions and onboarding</p>
                                <p>Enterprise readiness and procurement</p>
                                <p>Security reviews and compliance requests</p>
                                <p>Billing and account adjustments</p>
                            </div>
                        </GlassCard>

                        <div className="rounded-3xl border border-gray-200/70 bg-white/70 px-8 py-7 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Helpful links</h3>
                            <div className="mt-5 flex flex-wrap gap-3 text-sm">
                                <Link href="/privacy" className="rounded-full bg-white px-4 py-2 text-gray-700 ring-1 ring-gray-200 hover:ring-gray-300">
                                    Privacy
                                </Link>
                                <Link href="/security" className="rounded-full bg-white px-4 py-2 text-gray-700 ring-1 ring-gray-200 hover:ring-gray-300">
                                    Security
                                </Link>
                                <Link href="/terms" className="rounded-full bg-white px-4 py-2 text-gray-700 ring-1 ring-gray-200 hover:ring-gray-300">
                                    Terms
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
