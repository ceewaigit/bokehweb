import { cn } from "@/lib/utils";
import Link from "next/link";
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
    Legal: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Security", href: "/security" },
    ],
};

export function Footer({ className }: FooterProps) {
    return (
        <footer className={cn("relative overflow-hidden", className)}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7),transparent_70%)] blur-3xl pointer-events-none" />
            <div className="mx-auto max-w-7xl px-6 pb-12 pt-20">
                <div className="grid gap-10 lg:grid-cols-[1.2fr_2.2fr]">
                    <div className="space-y-6">
                        <Link href="/" className="inline-flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                                <Image
                                    src="/brand/bokeh_logo.svg"
                                    alt="bokeh"
                                    width={36}
                                    height={36}
                                    className="h-7 w-7"
                                />
                            </span>
                            <span className="text-lg font-semibold text-slate-900 tracking-tight">bokeh</span>
                        </Link>
                        <p className="text-base text-slate-600 max-w-sm">
                            A modern screen recording studio for teams who care about clarity, pace, and polish.
                        </p>
                        <div className="flex items-center gap-3">
                            <a
                                href="https://twitter.com"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition-colors hover:text-slate-900"
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
                                <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-4">
                                    {category}
                                </h3>
                                <ul className="space-y-3">
                                    {links.map((link) => (
                                        <li key={link.label}>
                                            <Link
                                                href={link.href}
                                                className="text-sm text-slate-700 hover:text-slate-900 transition-colors"
                                            >
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-16 flex flex-col gap-4 border-t border-white/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                        © {new Date().getFullYear()} bokeh. All rights reserved.
                    </p>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Crafted for focus and clarity
                    </p>
                </div>
            </div>
        </footer>
    );
}
