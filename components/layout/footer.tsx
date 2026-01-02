"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface FooterProps {
    className?: string;
}

const footerLinks = {
    Product: [
        { label: "Docs", href: "/docs" },
        { label: "Features", href: "/#features" },
        { label: "Pricing", href: "/#pricing" },
        { label: "Changelog", href: "/changelog" },
        { label: "Roadmap", href: "/roadmap" },
    ],
    Company: [{ label: "About", href: "/about" }],
    Legal: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Security", href: "/security" },
    ],
};

export function Footer({ className }: FooterProps) {
    const footerRef = useRef<HTMLElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const foregroundRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let rafId = 0;
        const isCoarse = window.matchMedia("(pointer: coarse)").matches;
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const clamp = (value: number, min: number, max: number) =>
            Math.min(Math.max(value, min), max);

        const update = () => {
            const footer = footerRef.current;
            if (!footer) return;
            const rect = footer.getBoundingClientRect();
            const viewport = window.innerHeight || 0;
            const progress = (viewport - rect.top) / (viewport + rect.height);
            const clamped = clamp(progress, 0, 1);

            if (prefersReducedMotion) {
                if (backdropRef.current) backdropRef.current.style.transform = "translate3d(0, 0, 0)";
                if (foregroundRef.current) foregroundRef.current.style.transform = "translate3d(0, 0, 0)";
                return;
            }

            const bgRange = isCoarse ? Math.min(viewport * 0.35, 220) : Math.min(viewport * 1.2, 1000);
            const fgRange = isCoarse ? 0 : Math.min(viewport * 0.7, 600);
            const bgOffset = (clamped - 0.5) * bgRange;
            const fgOffset = (clamped - 0.5) * fgRange;

            if (backdropRef.current) {
                backdropRef.current.style.transform = `translate3d(0, ${bgOffset}px, 0)`;
            }
            if (foregroundRef.current) {
                foregroundRef.current.style.transform = `translate3d(0, ${fgOffset}px, 0)`;
            }
        };

        const onScroll = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                update();
            });
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);

        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <footer
            ref={footerRef}
            className={cn(
                "relative overflow-hidden bg-[#0b0d12] px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8 lg:pt-16",
                className
            )}
        >
            <div className="absolute inset-0 z-20 pointer-events-none">
                <div
                    className="absolute inset-x-0 -top-1 h-12 rounded-b-[32px] sm:h-14 sm:rounded-b-[40px] lg:h-16 lg:rounded-b-[48px]"
                    style={{
                        background: "linear-gradient(180deg, #f8f9fc 0%, #ffffff 55%, #f8f9fc 100%)",
                        boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
                    }}
                />
            </div>

            <div ref={backdropRef} className="absolute inset-0 -z-10 will-change-transform">
                <div
                    className="absolute -top-[65%] -bottom-[65%] left-0 right-0"
                    style={{
                        backgroundImage: `
                            radial-gradient(1100px 520px at 70% 8%, rgba(139, 92, 246, 0.16), transparent 62%),
                            radial-gradient(1200px 620px at 72% 92%, rgba(251, 146, 60, 0.12), transparent 64%),
                            linear-gradient(180deg, #0b0d12 0%, #0f1117 52%, #0a0c11 100%)
                        `,
                        backgroundPosition: "50% 10%",
                        backgroundSize: "160% 160%",
                    }}
                />
                <div
                    className="absolute -top-[65%] -bottom-[65%] left-0 right-0 opacity-[0.6] mix-blend-soft-light"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.35' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundSize: "70px 70px",
                    }}
                />
                <div
                    className="absolute -top-[65%] -bottom-[65%] left-0 right-0 opacity-[0.35] mix-blend-overlay"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.05' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundSize: "120px 120px",
                    }}
                />
            </div>

            <div ref={foregroundRef} className="relative z-10 will-change-transform">
                <div
                    className="absolute inset-x-0 bottom-0 z-0 pointer-events-none select-none translate-y-[10%] sm:translate-y-[54%] lg:translate-y-[60%]"
                    aria-hidden="true"
                >
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
                        <span className="block text-[clamp(92px,22vw,300px)] font-black leading-[0.8] tracking-tight text-white/90 drop-shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                            bokeh.
                        </span>
                    </div>
                </div>

                <div className="relative z-10 mx-auto max-w-7xl pb-36 pt-10 sm:pb-44 sm:pt-14 lg:pb-56 lg:pt-[calc(5rem+5vh)]">
                    <div className="grid gap-10 lg:gap-14 lg:grid-cols-[1.1fr_2.2fr]">
                        <div className="space-y-6">
                            <Link
                                href="/"
                                className="group inline-flex items-center gap-3 transition-transform duration-200 ease-out will-change-transform hover:translate-x-0.5"
                            >
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur transition-all duration-200 ease-out will-change-transform group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.45)] group-hover:scale-105">
                                    <Image
                                        src="/brand/bokeh_logo.svg"
                                        alt="bokeh"
                                        width={40}
                                        height={40}
                                        className="h-7 w-7"
                                    />
                                </span>
                                <span className="text-lg font-semibold text-white tracking-tight transition-opacity duration-200 group-hover:opacity-80">
                                    bokeh
                                </span>
                            </Link>
                            <p className="text-base text-slate-200/80 max-w-sm leading-relaxed">
                                A macOS screen recording utility that makes every recording look finished.
                            </p>
                            <div className="flex items-center gap-3">
                                <a
                                    href="https://twitter.com"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-slate-200 shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out will-change-transform hover:scale-110 hover:text-white hover:bg-white/20"
                                    aria-label="Twitter"
                                >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        <div className="grid gap-8 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="lg:contents">
                                <FooterLinkGroup category="Product" links={footerLinks.Product} />
                            </div>

                            <div className="flex flex-col gap-8 lg:contents">
                                <FooterLinkGroup category="Company" links={footerLinks.Company} />
                                <FooterLinkGroup category="Legal" links={footerLinks.Legal} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-300/70 transition-opacity duration-200 hover:opacity-90">
                            © {new Date().getFullYear()} bokeh. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function FooterLinkGroup({ category, links }: { category: string; links: { label: string; href: string }[] }) {
    return (
        <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-300/70 mb-4 font-medium">
                {category}
            </h3>
            <ul className="space-y-2.5">
                {links.map((link) => (
                    <li key={link.label}>
                        <Link
                            href={link.href}
                            className="group/link inline-flex items-center gap-1 text-sm text-slate-200/75 transition-all duration-200 ease-out hover:text-white"
                        >
                            <span className="transition-transform duration-200 ease-out will-change-transform group-hover/link:translate-x-0.5">
                                {link.label}
                            </span>
                            <svg
                                className="h-3 w-3 opacity-0 -translate-x-1 transition-all duration-200 ease-out will-change-transform group-hover/link:opacity-60 group-hover/link:translate-x-0"
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
    );
}
