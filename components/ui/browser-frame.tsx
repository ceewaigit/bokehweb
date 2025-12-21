"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface BrowserFrameProps extends HTMLMotionProps<"div"> {
    children?: React.ReactNode;
    variant?: "light" | "dark";
    showControls?: boolean;
    url?: string;
}

const BrowserFrame = forwardRef<HTMLDivElement, BrowserFrameProps>(
    ({ className, variant = "light", showControls = true, url, children, ...props }, ref) => {
        const isDark = variant === "dark";

        return (
            <motion.div
                ref={ref}
                className={cn(
                    "relative rounded-xl overflow-hidden bg-white/80 backdrop-blur-xl",
                    "border border-white/20 shadow-2xl ring-1 ring-black/5",
                    isDark && "dark",
                    className
                )}
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
                {...props}
            >
                {/* Browser Chrome */}
                {showControls && (
                    <div
                        className={cn(
                            "relative z-10 flex items-center px-4 py-2 border-b border-black/5",
                            "bg-gradient-to-b from-white/60 to-white/30 backdrop-blur-xl"
                        )}
                    >
                        {/* Traffic Lights */}
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[#FF5F57] shadow-inner ring-1 ring-black/5" />
                            <div className="w-3 h-3 rounded-full bg-[#FEBC2E] shadow-inner ring-1 ring-black/5" />
                            <div className="w-3 h-3 rounded-full bg-[#28C840] shadow-inner ring-1 ring-black/5" />
                        </div>

                        {/* Centered Title/URL */}
                        {url && (
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="h-3 w-3 rounded-full bg-slate-400/20" /> {/* Favicon placeholder */}
                                <span className="text-[12px] font-medium text-slate-700 font-sans tracking-tight">
                                    {url.replace(/^https?:\/\//, '')}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="relative z-0">
                    {children}
                </div>
            </motion.div>
        );
    }
);

BrowserFrame.displayName = "BrowserFrame";

export { BrowserFrame };
