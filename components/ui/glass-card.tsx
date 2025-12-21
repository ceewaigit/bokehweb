"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
    variant?: "default" | "subtle" | "strong";
    hover?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
    ({ className, variant = "default", hover = true, children, style, ...props }, ref) => {
        const variants = {
            default: "bg-white/70 dark:bg-white/5 backdrop-blur-xl border-white/50 dark:border-white/10",
            subtle: "bg-white/40 dark:bg-white/[0.02] backdrop-blur-lg border-white/30 dark:border-white/5",
            strong: "bg-white/90 dark:bg-white/10 backdrop-blur-2xl border-white/60 dark:border-white/15",
        };
        const fadeInStyle = { opacity: 0 };
        const mergedStyle = { ...fadeInStyle, ...style };

        return (
            <motion.div
                ref={ref}
                className={cn(
                    "rounded-2xl border shadow-lg",
                    variants[variant],
                    hover && "transition-all duration-300 hover:shadow-xl hover:scale-[1.02]",
                    className
                )}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                style={mergedStyle}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

GlassCard.displayName = "GlassCard";

export { GlassCard };
