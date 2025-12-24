"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HighlightCircleProps {
    children: React.ReactNode;
    className?: string;
    color?: string; // Hex or tailwind class text-* if using currentColor
    delay?: number;
}

export function HighlightCircle({
    children,
    className,
    color = "#FACC15", // Default yellow-400
    delay = 0
}: HighlightCircleProps) {
    return (
        <span className={cn("relative inline-block px-1", className)}>
            <span className="relative z-10">{children}</span>
            <svg
                viewBox="0 0 286 73"
                fill="none"
                className="absolute -left-2 -right-2 -top-2 bottom-0 translate-y-1 w-[calc(100%+16px)] h-[calc(100%+8px)] pointer-events-none z-0"
                preserveAspectRatio="none"
            >
                <motion.path
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-10%" }}
                    transition={{
                        duration: 0.8,
                        delay: delay,
                        ease: "easeInOut",
                    }}
                    d="M142.293 1C106.854 16.8908 6.08202 7.17705 1.23654 43.3756C-2.10604 68.3466 29.5633 73.2652 122.688 71.7518C215.814 70.2384 316.298 70.689 275.761 38.0785C230.14 1.37835 97.0503 24.4575 52.9384 1"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </span>
    );
}
