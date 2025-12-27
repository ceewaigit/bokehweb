/**
 * Shared animation utilities for consistent, performant animations.
 * Centralizes GPU acceleration styles, spring configs, and motion variants.
 */

/**
 * GPU-accelerated style object for smooth 60fps animations.
 * Apply to motion components via the `style` prop.
 */
export const gpuAccelerated = {
    willChange: 'transform, opacity' as const,
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden' as const,
} as const;

/**
 * Spring configurations for consistent animation feel.
 * Use the right config based on the interaction type.
 */
export const springConfigs = {
    /** Default spring - balanced responsiveness */
    default: { type: 'spring', stiffness: 300, damping: 25 } as const,
    /** Soft spring - gentle, less stiff */
    soft: { type: 'spring', stiffness: 250, damping: 22 } as const,
    /** Snappy spring - quick, responsive micro-interactions */
    snappy: { type: 'spring', stiffness: 400, damping: 17 } as const,
    /** Gentle spring - slow, elegant transitions */
    gentle: { type: 'spring', stiffness: 150, damping: 20 } as const,
} as const;

/**
 * Standard easing curves for non-spring animations.
 */
export const easings = {
    /** Apple-esque ease out */
    easeOut: [0.22, 1, 0.36, 1] as const,
    /** Smooth ease in-out */
    easeInOut: [0.25, 0.1, 0.25, 1] as const,
    /** Subtle ease for micro-interactions */
    subtle: [0.21, 0.47, 0.32, 0.98] as const,
} as const;

/**
 * Fade-in animation variants for whileInView.
 * Use with staggerChildren for lists.
 */
export const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: easings.easeOut }
    },
} as const;

/**
 * Container variants for staggered children animations.
 */
export const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.1,
        },
    },
} as const;

/**
 * Check if user prefers reduced motion.
 * Use this to conditionally disable animations.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
