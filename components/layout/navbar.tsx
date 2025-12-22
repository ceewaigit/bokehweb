"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";

interface NavbarProps {
    className?: string;
}

const closeMenu = (setOpen: (v: boolean) => void) => {
    setOpen(false);
};

export function Navbar({ className }: NavbarProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { scrollY } = useScroll();
    const paddingY = useTransform(scrollY, [0, 120], [18, 12]);

    const navLinks = [
        { href: "/#features", label: "Features" },
        { href: "/#pricing", label: "Pricing" },
        { href: "/#resources", label: "Resources" },
    ];

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileMenuOpen]);

    return (
        <>
            <motion.header
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 px-6",
                    className
                )}
                style={{
                    paddingTop: paddingY,
                    paddingBottom: paddingY,
                }}
            >
                <nav className="mx-auto flex max-w-7xl items-center justify-between relative">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3 z-10">
                        <div className="flex items-center gap-3 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]">
                            {/* <div className="rounded-full bg-white/80 shadow-[0_6px_18px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/50">
                                <Image
                                    src="/brand/bokeh_logo.svg"
                                    alt="bokeh"
                                    width={120}
                                    height={36}
                                    className="h-7 w-auto"
                                    priority
                                />
                            </div> */}
                            <span className="text-[18px] font-semibold text-slate-900 tracking-[-0.01em]">bokeh.</span>
                        </div>
                    </Link>

                    {/* Navigation Links - Desktop (Absolutely centered) */}
                    <div className="hidden md:flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-full border border-white/55 bg-white/70 px-4 py-2 text-[13px] font-semibold tracking-[0.02em] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-200 ease-out hover:bg-white/85 hover:text-slate-900 hover:-translate-y-px active:scale-[0.98]"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    {/* Right side: Menu trigger (mobile) + CTA buttons */}
                    <div className="flex items-center gap-2">
                        {/* Three-dot menu trigger - Mobile only */}
                        <button
                            className="md:hidden flex items-center justify-center w-9 h-9 rounded-full border border-white/55 bg-white/75 text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-150 hover:bg-white/90 active:scale-95"
                            onClick={() => setMobileMenuOpen(true)}
                            aria-label="Open menu"
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-current">
                                <circle cx="3" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="13" cy="8" r="1.5" fill="currentColor" />
                            </svg>
                        </button>

                        {/* Desktop buttons */}
                        <div className="hidden md:block">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full border border-white/55 bg-white/75 text-[13px] font-semibold tracking-[0.02em] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-200 ease-out hover:bg-white/90 hover:text-slate-900 hover:-translate-y-px active:scale-[0.98]"
                            >
                                Log in
                            </Button>
                        </div>
                        <Button
                            size="sm"
                            asChild
                            className="rounded-full border border-white/60 bg-white/85 px-5 text-[13px] font-semibold tracking-[0.02em] text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-200 ease-out hover:bg-white hover:-translate-y-px active:scale-[0.98]"
                        >
                            <Link href="/#pricing">
                                Get started
                            </Link>
                        </Button>
                    </div>
                </nav>
            </motion.header>

            {/* Fullscreen Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                        className="fixed inset-0 z-[100] md:hidden bg-white/95 backdrop-blur-xl"
                    >
                        {/* Menu Content */}
                        <div className="h-full flex flex-col px-8 pt-6 pb-12">
                            {/* Header with close button */}
                            <div className="flex items-center justify-between mb-12">
                                <Link
                                    href="/"
                                    onClick={() => closeMenu(setMobileMenuOpen)}
                                    className="flex items-center gap-3"
                                >
                                    {/* <div className="rounded-full bg-white/80 shadow-[0_6px_18px_rgba(15,23,42,0.12)] ring-1 ring-inset ring-white/50">
                                        <Image
                                            src="/brand/bokeh_logo.svg"
                                            alt="bokeh"
                                            width={120}
                                            height={36}
                                            className="h-7 w-auto"
                                        />
                                    </div> */}
                                    <span className="text-[18px] font-semibold text-slate-900 tracking-[-0.01em]">bokeh.</span>
                                </Link>
                                <button
                                    type="button"
                                    className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-600 transition-all duration-150 hover:bg-slate-200 active:scale-95"
                                    onClick={() => closeMenu(setMobileMenuOpen)}
                                    aria-label="Close menu"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Navigation Links */}
                            <nav className="flex-1 flex flex-col justify-center -mt-16">
                                <div className="space-y-1">
                                    {navLinks.map((link, index) => (
                                        <motion.div
                                            key={link.href}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                delay: 0.05 + index * 0.03,
                                                duration: 0.25,
                                                ease: [0.32, 0.72, 0, 1]
                                            }}
                                        >
                                            <Link
                                                href={link.href}
                                                onClick={() => closeMenu(setMobileMenuOpen)}
                                                className="block py-3 text-[24px] font-semibold text-slate-900 tracking-[-0.02em] transition-colors duration-150 hover:text-slate-500"
                                            >
                                                {link.label}
                                            </Link>
                                        </motion.div>
                                    ))}
                                </div>
                            </nav>

                            {/* Bottom actions */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                                className="flex flex-col gap-3"
                            >
                                <Button
                                    size="lg"
                                    asChild
                                    className="w-full rounded-full bg-slate-900 text-white text-[15px] font-semibold py-6 transition-all duration-150 hover:bg-slate-800 active:scale-[0.98]"
                                >
                                    <Link
                                        href="/#pricing"
                                        onClick={() => closeMenu(setMobileMenuOpen)}
                                    >
                                        Get started
                                    </Link>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    className="w-full rounded-full text-slate-600 text-[15px] font-semibold py-6 transition-all duration-150 hover:bg-slate-100 active:scale-[0.98]"
                                    onClick={() => closeMenu(setMobileMenuOpen)}
                                >
                                    Log in
                                </Button>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
