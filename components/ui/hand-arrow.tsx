"use client";

import { cn } from "@/lib/utils";
import { motion, SVGMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface HandArrowProps extends SVGMotionProps<SVGSVGElement> {
    direction?: "up" | "down" | "left" | "right" | "up-right" | "down-right";
    size?: "sm" | "md" | "lg";
    animated?: boolean;
}

// Artistic hand-drawn paths with organic flowing curves
const paths = {
    "up": "M 25 85 C 15 70, 35 55, 20 45 C 8 35, 45 25, 35 15 S 50 8, 48 5",
    "down": "M 25 15 C 15 30, 35 45, 20 55 C 8 65, 45 75, 35 85 S 50 92, 48 95",
    "left": "M 85 55 C 70 40, 60 65, 45 50 C 30 35, 35 60, 15 50 S 5 52, 3 50",
    "right": "M 10 50 C 30 45, 50 55, 90 50",
    "up-right": "M 8 85 C 20 75, 15 60, 35 55 C 55 50, 40 35, 60 30 C 80 25, 70 15, 92 12",
    // Simpler, elegant loop
    "down-right": "M 20 10 C 60 10, 50 50, 30 40 C 20 35, 30 20, 50 20 C 70 20, 75 50, 75 80",
};

// Hand-drawn style arrow heads - organic pointed tips
const arrowHeads = {
    "up": "M 42 12 C 44 8, 48 3, 50 2 C 52 4, 56 10, 58 14",
    "down": "M 42 88 C 44 92, 48 97, 50 98 C 52 96, 56 90, 58 86",
    // Aligned with new simple path
    "left": "M 10 44 C 6 46, 2 49, 1 50 C 3 52, 8 56, 12 58",
    "right": "M 82 42 C 86 46, 88 48, 90 50 C 88 52, 84 56, 82 60",
    "up-right": "M 85 8 C 90 10, 95 10, 96 12 M 96 12 C 94 16, 94 22, 92 26",
    // V connecting at line end (75, 80)
    "down-right": "M 65 72 L 75 80 L 85 72",
};

const sizes = {
    sm: { width: 40, height: 40 },
    md: { width: 60, height: 60 },
    lg: { width: 80, height: 80 },
};

const HandArrow = forwardRef<SVGSVGElement, HandArrowProps>(
    ({
        direction = "up-right",
        size = "md",
        animated = true,
        className,
        style,
        ...props
    }, ref) => {
        const { width, height } = sizes[size];
        const fadeInStyle = animated ? { opacity: 0 } : undefined;
        const mergedStyle = { ...fadeInStyle, ...style };

        return (
            <motion.svg
                ref={ref}
                viewBox="0 0 100 100"
                width={width}
                height={height}
                fill="none"
                className={cn("text-foreground/70", className)}
                initial={animated ? { opacity: 0, scale: 0.8 } : undefined}
                whileInView={animated ? { opacity: 1, scale: 1 } : undefined}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                style={mergedStyle}
                {...props}
            >
                {/* Line draws first */}
                <motion.path
                    d={paths[direction]}
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={animated ? { pathLength: 1, opacity: 1 } : undefined}
                    viewport={{ once: true }}
                    transition={{
                        duration: 1,
                        ease: "easeOut",
                        delay: 0.2 // Wait for svg fade in
                    }}
                />
                {/* Arrow tip draws AFTER line */}
                <motion.path
                    d={arrowHeads[direction]}
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={animated ? { pathLength: 1, opacity: 1 } : undefined}
                    viewport={{ once: true }}
                    transition={{
                        duration: 0.4,
                        ease: "easeOut",
                        delay: 1 // Start after line finishes (0.2 + 0.8s)
                    }}
                />
            </motion.svg>
        );
    }
);

HandArrow.displayName = "HandArrow";

export { HandArrow };
