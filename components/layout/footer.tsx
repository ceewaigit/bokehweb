import { SectionBackdrop } from "@/components/ui/section-backdrop";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface FooterProps {
    className?: string;
}

const footerLinks = {
    Product: [
        { label: "Features", href: "/#features" },
        { label: "Pricing", href: "/#pricing" },
        { label: "Changelog", href: "/changelog" },
        { label: "Roadmap", href: "/roadmap" },
    ],
    Company: [
        { label: "About", href: "/about" },
    ],
    Legal: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Security", href: "/security" },
    ],
};

export function Footer({ className }: FooterProps) {
    return (
        <footer className={cn("relative py-8 px-4 sm:px-6 lg:px-8", className)}>
            {/* Subtle ambient glow */}
            <div
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[80%] h-[120%] pointer-events-none opacity-60"
                style={{
                    background: "radial-gradient(ellipse at center, rgba(139, 92, 246, 0.08) 0%, transparent 70%)",
                }}
            />

            {/* Floating container with rounded corners */}
            <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_20px_rgba(15,23,42,0.04)] bg-gradient-to-b from-slate-50/50 to-transparent">
                <SectionBackdrop variant="dots" texture fade="all" className="opacity-30" />

                <div className="relative z-10 px-8 sm:px-12 lg:px-16 pb-10 pt-14">
                    <div className="grid gap-10 lg:grid-cols-[1.2fr_2.2fr]">
                        <div className="space-y-6">
                            <Link
                                href="/"
                                className="group inline-flex items-center gap-3 transition-transform duration-200 ease-out will-change-transform hover:translate-x-0.5"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-all duration-200 ease-out will-change-transform group-hover:shadow-[0_12px_32px_rgba(15,23,42,0.16)] group-hover:scale-105">
                                    <Image
                                        src="/brand/bokeh_logo.svg"
                                        alt="bokeh"
                                        width={36}
                                        height={36}
                                        className="h-7 w-7"
                                    />
                                </span>
                                <span className="text-lg font-semibold text-slate-900 tracking-tight transition-opacity duration-200 group-hover:opacity-80">bokeh</span>
                            </Link>
                            <p className="text-base text-slate-600 max-w-sm leading-relaxed">
                                A macOS screen recording utility that makes every recording look finished.
                            </p>
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://twitter.com"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-[0_4px_16px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out will-change-transform hover:scale-110 hover:text-slate-900 hover:shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                                    aria-label="Twitter"
                                >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                            {Object.entries(footerLinks).map(([category, links]) => (
                                <div key={category}>
                                    <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-4 font-medium">
                                        {category}
                                    </h3>
                                    <ul className="space-y-2.5">
                                        {links.map((link) => (
                                            <li key={link.label}>
                                                <Link
                                                    href={link.href}
                                                    className="group/link inline-flex items-center gap-1 text-sm text-slate-600 transition-all duration-200 ease-out hover:text-slate-900"
                                                >
                                                    <span className="transition-transform duration-200 ease-out will-change-transform group-hover/link:translate-x-0.5">
                                                        {link.label}
                                                    </span>
                                                    <svg
                                                        className="h-3 w-3 opacity-0 -translate-x-1 transition-all duration-200 ease-out will-change-transform group-hover/link:opacity-50 group-hover/link:translate-x-0"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-12 flex flex-col gap-4 border-t border-slate-200/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-400 transition-opacity duration-200 hover:opacity-80">
                            © {new Date().getFullYear()} bokeh. All rights reserved.
                        </p>
                        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-slate-400/80 transition-colors duration-300 hover:text-slate-600">
                            <span className="flex items-center gap-1.5 selection:bg-red-100 selection:text-red-900">
                                Crafted with <span className="text-red-500 animate-pulse drop-shadow-sm hover:scale-110 transition-transform duration-200">❤️</span> by
                            </span>
                            <a
                                href="https://www.ceewai.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group/creator flex items-center gap-2 pl-1 py-1 pr-2.5 rounded-full bg-slate-100/50 border border-transparent hover:border-slate-200/60 hover:bg-white hover:shadow-sm transition-all duration-300 ease-out cursor-pointer"
                            >
                                <Image
                                    src="/ceewai.ico"
                                    alt="ceewai"
                                    width={20}
                                    height={20}
                                    className="h-5 w-5 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out group-hover/creator:scale-105 group-hover/creator:rotate-3"
                                />
                                <span className="bg-gradient-to-br from-slate-700 to-slate-500 bg-clip-text text-transparent group-hover/creator:from-slate-900 group-hover/creator:to-slate-700 transition-all duration-300 font-semibold tracking-tight">ceewai</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
