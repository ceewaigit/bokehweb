"use client";

import React, { useState } from "react";
import styles from "./philosophy-effects.module.css";
import { cn } from "@/lib/utils";

/**
 * A card component that triggers a gradient pulse animation on click/press.
 * 
 * Usage:
 * <PulseCard gradientHue1={200} gradientHue2={220}>Content</PulseCard>
 */
export function PulseCard({
    children,
    className,
    gradientHue1 = 123,
    gradientHue2 = 145
}: {
    children: React.ReactNode;
    className?: string;
    gradientHue1?: number;
    gradientHue2?: number;
}) {
    const [isAnimating, setIsAnimating] = useState(false);

    const triggerPulse = () => {
        // Reset animation to allow re-triggering
        setIsAnimating(false);
        // Force browser to register the state change before re-enabling
        // Using a micro-timeout to ensure the Class removal is processed
        setTimeout(() => setIsAnimating(true), 10);
    };

    return (
        <div
            className={cn(styles.pulseCard, "cursor-pointer select-none", className)}
            onClick={triggerPulse}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    triggerPulse();
                }
            }}
            role="button"
            tabIndex={0}
            style={{
                '--hue1': gradientHue1,
                '--hue2': gradientHue2
            } as React.CSSProperties}
        >
            <div className={styles.gradientMask}>
                <div
                    className={cn(styles.gradient, isAnimating && styles.animate)}
                    onAnimationEnd={() => setIsAnimating(false)}
                />
            </div>
            {/* Inner Content Container */}
            <div className="relative z-10 h-full pointer-events-none">
                {children}
            </div>
        </div>
    );
}
