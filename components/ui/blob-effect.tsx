"use client";

import React from "react";
import styles from "./philosophy-effects.module.css";
import { cn } from "@/lib/utils";

/**
 * An organic, animated blob component with mesh gradient and glow effects.
 * The blob animates organically via CSS keyframe animations and speeds up on hover.
 */
export function BlobEffect({ className }: { className?: string }) {
    return (
        <div className={cn(styles.blobWrapper, className)}>
            {/* SVG Filters - Hidden utility SVG */}
            <svg width="0" height="0" className="absolute pointer-events-none opacity-0" aria-hidden="true">
                <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blurred" />
                        <feComponentTransfer in="blurred" result="brighterGlow">
                            <feFuncA type="linear" slope="0.5" />
                        </feComponentTransfer>
                        <feMerge>
                            <feMergeNode in="brighterGlow" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
            </svg>

            {/* The blob shape element - all styling (background, clip-path) is on this single element */}
            <div
                className={styles.blobShape}
                style={{ filter: 'url(#glow)' }}
                onMouseEnter={(e) => {
                    const anims = e.currentTarget.getAnimations();
                    anims.forEach(anim => anim.updatePlaybackRate(2));
                }}
                onMouseLeave={(e) => {
                    const anims = e.currentTarget.getAnimations();
                    anims.forEach(anim => anim.updatePlaybackRate(1));
                }}
            />
        </div>
    );
}
