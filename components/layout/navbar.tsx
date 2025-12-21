"use client";

import { cn } from "@/lib/utils";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

interface NavbarProps {
    className?: string;
}

export function Navbar({ className }: NavbarProps) {
    const { scrollY } = useScroll();
    const paddingY = useTransform(scrollY, [0, 120], [18, 12]);

    return (
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
            <nav className="mx-auto flex max-w-7xl items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3">
                    <motion.div
                        className="flex items-center gap-3"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className="rounded-full bg-white/80 shadow-[0_6px_18px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/50">
                            <Image
                                src="/brand/bokeh_logo.svg"
                                alt="bokeh"
                                width={120}
                                height={36}
                                className="h-7 w-auto"
                                priority
                            />
                        </div>
                        <span className="text-[18px] font-semibold text-slate-900 tracking-[-0.01em]">bokeh.</span>
                    </motion.div>
                </Link>

                {/* Navigation Links */}
                <div className="hidden md:flex items-center gap-3">
                    {["Features", "Pricing", "Resources"].map((item) => (
                        <motion.div
                            key={item}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 260, damping: 22 }}
                        >
                            <Link
                                href={`/${item.toLowerCase()}`}
                                className="rounded-full border border-white/55 bg-white/70 px-4 py-2 text-[13px] font-semibold tracking-[0.02em] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-250 hover:bg-white/85 hover:text-slate-900 hover:shadow-[0_16px_36px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]"
                            >
                                {item}
                            </Link>
                        </motion.div>
                    ))}
                </div>

                {/* CTA Buttons */}
                <div className="flex items-center gap-2">
                    <motion.div
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                            className="group hidden sm:inline-flex rounded-full border border-white/55 bg-white/75 text-[13px] font-semibold tracking-[0.02em] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-250 hover:bg-white/90 hover:text-slate-900 hover:shadow-[0_16px_36px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]"
                        >
                            Log in
                        </Button>
                    </motion.div>
                    <motion.div
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                        <Button
                            size="sm"
                            className="group rounded-full border border-white/60 bg-white/85 px-5 text-[13px] font-semibold tracking-[0.02em] text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-250 hover:bg-white hover:shadow-[0_18px_44px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.95)]"
                        >
                            Get started
                        </Button>
                    </motion.div>
                </div>
            </nav>
        </motion.header>
    );
}
