"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Theme = "glass" | "solid" | "clear";

export function GlassmorphismItem({ size = "sm" }: { size?: "sm" | "lg" }) {
    const [theme, setTheme] = useState<Theme>("solid");

    const themes = {
        glass: {
            container: "bg-white/60 backdrop-blur-xl border border-white/50 shadow-xl ring-1 ring-white/60",
            content: "bg-white/50 border border-white/20",
            indicator: "bg-white shadow-sm"
        },
        solid: {
            container: "bg-white border border-white/50 shadow-2xl shadow-black/5 ring-1 ring-black/5",
            content: "bg-gray-50 border border-gray-100/50",
            indicator: "bg-white shadow-sm border border-gray-100"
        },
        clear: {
            container: "bg-white/10 backdrop-blur-[2px] border border-white/20 shadow-lg ring-1 ring-white/10",
            content: "bg-white/10 border border-white/10",
            indicator: "bg-white/20 backdrop-blur-md border border-white/20"
        }
    };

    const springConfig = { type: "spring", stiffness: 350, damping: 25 } as const;

    const isLarge = size === "lg";

    return (
        <div className="absolute inset-0 w-full h-full flex flex-col justify-end items-end">
            <motion.div
                layout
                className={cn(
                    "rounded-tl-2xl p-6 flex flex-col justify-between relative z-10 transition-all duration-500 shadow-xl origin-bottom-right",
                    isLarge
                        ? "w-[90%] max-w-[500px] aspect-[1.6/1] translate-x-[-5%] translate-y-[-5%]"
                        : "w-[110%] max-w-[300px] aspect-[1.8/1] translate-x-4 translate-y-4",
                    themes[theme].container
                )}
            >
                {/* Header Mockup */}
                <div className="flex items-center justify-between opacity-80">
                    <div className="flex gap-2">
                        <div className={cn("rounded-full opacity-40 transition-all", isLarge ? "w-4 h-4" : "w-3 h-3", theme === 'solid' ? "bg-black" : "bg-current")} />
                        <div className={cn("rounded-full opacity-40 transition-all", isLarge ? "w-4 h-4" : "w-3 h-3", theme === 'solid' ? "bg-black" : "bg-current")} />
                    </div>
                    <div className={cn("rounded-full opacity-10 transition-all", isLarge ? "h-2 w-12" : "h-1.5 w-8", theme === 'solid' ? "bg-black" : "bg-current")} />
                </div>

                {/* Content Area Mockup */}
                <div className="flex gap-4 items-center">
                    <div className={cn("rounded-xl transition-colors duration-500 flex items-center justify-center shadow-sm", isLarge ? "w-20 h-20" : "w-12 h-12", themes[theme].content)}>
                        <div className={cn("rounded-md opacity-30", isLarge ? "w-10 h-10" : "w-6 h-6", themes[theme].indicator)} />
                    </div>
                    <div className="flex-1 space-y-2 py-1">
                        <div className={cn("rounded-full opacity-10", isLarge ? "h-3" : "h-2", "w-3/4", theme === 'solid' ? "bg-black" : "bg-current")} />
                        <div className={cn("rounded-full opacity-10", isLarge ? "h-3" : "h-2", "w-1/2", theme === 'solid' ? "bg-black" : "bg-current")} />
                    </div>
                </div>

                {/* Segmented Control Switcher */}
                <div className={cn("bg-black/5 backdrop-blur-xl rounded-lg flex relative z-20 self-center w-full", isLarge ? "p-1.5 max-w-[320px]" : "p-1 max-w-[220px]")}>
                    {(["solid", "glass", "clear"] as Theme[]).map((t) => (
                        <button
                            key={t}
                            onClick={(e) => {
                                e.stopPropagation();
                                setTheme(t);
                            }}
                            className={cn(
                                "flex-1 rounded-[6px] font-semibold transition-colors duration-200 relative z-10 text-center tracking-tight",
                                isLarge ? "py-2 px-4 text-sm" : "py-1 px-2 text-[10px]",
                                theme === t ? "text-black" : "text-black/40 hover:text-black/60"
                            )}
                        >
                            {theme === t && (
                                <motion.div
                                    layoutId="activeSegment"
                                    className="absolute inset-0 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-[6px] ring-1 ring-black/5"
                                    transition={springConfig}
                                />
                            )}
                            <span className="relative z-20 capitalize">{t}</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
