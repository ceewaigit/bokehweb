"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface DisplayTextProps extends HTMLMotionProps<"h1"> {
    as?: "h1" | "h2" | "h3" | "h4" | "span";
    size?: "sm" | "md" | "lg" | "xl" | "2xl";
    gradient?: boolean;
    italic?: boolean;
}

const sizeClasses = {
    sm: "text-3xl md:text-4xl lg:text-[2.25rem]",
    md: "text-4xl md:text-5xl lg:text-[3rem]",
    lg: "text-5xl md:text-6xl lg:text-[3.75rem]",
    xl: "text-5xl md:text-6xl lg:text-7xl",
    "2xl": "text-6xl md:text-7xl lg:text-[4.5rem]",
};

const DisplayText = forwardRef<HTMLHeadingElement, DisplayTextProps>(
    (
        {
            as: Tag = "h1",
            size = "xl",
            gradient = false,
            italic = false,
            className,
            children,
            ...props
        },
        ref
    ) => {
        const MotionTag = motion[Tag] as typeof motion.h1;

        return (
            <MotionTag
                ref={ref}
                className={cn(
                    "font-bold tracking-tight leading-[1.1]",
                    sizeClasses[size],
                    gradient && "bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent",
                    italic && "font-[family-name:var(--font-display)] italic font-medium",
                    className
                )}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                {...props}
            >
                {children}
            </MotionTag>
        );
    }
);

DisplayText.displayName = "DisplayText";

export { DisplayText };
