"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useInView, motion } from "framer-motion"
import { annotate } from "rough-notation"
import { type RoughAnnotation } from "rough-notation/lib/model"
import { cn } from "@/lib/utils"

export type AnnotationAction =
    | "highlight"
    | "underline"
    | "box"
    | "circle"
    | "strike-through"
    | "crossed-off"
    | "bracket"

export type AnnotationStyle = "rough" | "clean"

export interface HighlighterProps {
    children: ReactNode
    className?: string
    action?: AnnotationAction
    style?: AnnotationStyle
    color?: string
    strokeWidth?: number
    animationDuration?: number
    iterations?: number
    padding?: number
    multiline?: boolean
    brackets?: string | string[]
    isView?: boolean
    delay?: number
}

export function Highlighter({
    children,
    className,
    action = "highlight",
    style = "rough",
    color = "#ffd1dc",
    strokeWidth = 1.5,
    animationDuration = 600,
    iterations = 2,
    padding = 2,
    multiline = true,
    brackets,
    isView = true,
    delay = 0,
}: HighlighterProps) {
    const elementRef = useRef<HTMLSpanElement>(null)
    const annotationRef = useRef<RoughAnnotation | null>(null)

    const isInView = useInView(elementRef, {
        once: true,
        margin: "-10%",
    })

    // If isView is false, always show. If isView is true, wait for inView
    const shouldShow = !isView || isInView

    // Rough notation effect
    useEffect(() => {
        if (style !== "rough") return

        const element = elementRef.current
        if (!element) return

        // 1. Initialize annotation but don't show yet
        const annotationConfig = {
            type: action,
            color,
            strokeWidth,
            animationDuration,
            iterations,
            padding,
            multiline,
            brackets: brackets as any,
        }

        const annotation = annotate(element, annotationConfig)
        annotationRef.current = annotation

        // 2. Logic to show: checked by both isView and ResizeObserver (for expanding elements)
        const showAnnotation = () => {
            if (!elementRef.current || !annotationRef.current) return
            // Check if element has size (is visible)
            if (elementRef.current.getClientRects().length === 0) return
            // Also check framer-motion isView
            if (isView && !isInView) return

            // Check if already visible to prevent re-triggering (flicker)
            if (annotationRef.current.isShowing()) return

            annotationRef.current.show()
        }

        let timer: NodeJS.Timeout

        // Check initially (delayed)
        if (delay > 0) {
            timer = setTimeout(showAnnotation, delay)
        } else {
            showAnnotation()
        }

        // 3. Watch for resize (like accordion opening)
        // We track the last state to avoid flickering during continuous layout changes (animations)
        let wasVisible = false

        const resizeObserver = new ResizeObserver(() => {
            if (!annotationRef.current || !elementRef.current) return

            const rects = elementRef.current.getClientRects()
            const isVisible = rects.length > 0 && (!isView || isInView)

            if (isVisible && !wasVisible) {
                // Became visible
                annotationRef.current.show()
                wasVisible = true
            } else if (!isVisible && wasVisible) {
                // Became hidden
                annotationRef.current.hide()
                wasVisible = false
            }
            // If isVisible && wasVisible, do nothing (prevent flicker during animation)
        })

        resizeObserver.observe(element)

        return () => {
            clearTimeout(timer)
            annotation.remove()
            resizeObserver.disconnect()
        }
    }, [
        isInView, // Added isInView dependency
        shouldShow,
        action,
        color,
        strokeWidth,
        animationDuration,
        iterations,
        padding,
        multiline,
        style,
        brackets,
        delay,
        isView // Added isView
    ])

    if (style === "clean") {
        if (action === "highlight") {
            // Map colors to CSS classes if possible, or use a custom inline style for dynamic colors if we want to be fancy.
            // But preserving "ours were more suitable" implies we should use the exact gradients.
            // We can try to match the hex color to the class, or just accept that "clean" highlight relies on specific colors.
            // Let's deduce the class variant from the color if provided, or default to yellow.

            let variantClass = "highlight-yellow"
            if (color === "#a78bfa") variantClass = "highlight-purple"
            if (color === "#f472b6") variantClass = "highlight-pink"
            if (color === "#fde047") variantClass = "highlight-yellow"

            // If it's a completely unknown color, we might want to implement a dynamic gradient generator
            // but for now, let's stick to the ones we have or fallback to yellow.

            return (
                <span ref={elementRef}
                    className={cn(shouldShow ? variantClass : "", className)}
                    style={{ animationDelay: `${delay}ms` }}
                >
                    {children}
                </span>
            )
        }

        if (action === "circle") {
            return (
                <span ref={elementRef} className={cn("relative inline-block px-1", className)}>
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
                            viewport={{ once: true }}
                            transition={{
                                duration: animationDuration / 1000,
                                delay: delay / 1000,
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

        if (action === "strike-through" || action === "crossed-off") {
            return (
                <span ref={elementRef} className={cn("relative inline-block", className)}>
                    <span className="relative z-10">{children}</span>
                    <svg
                        className="pointer-events-none absolute left-[-2%] top-[60%] h-4 w-[104%] -translate-y-1/2 z-20"
                        viewBox="0 0 100 12"
                        preserveAspectRatio="none"
                        fill="none"
                    >
                        <motion.path
                            d="M0 6.6 Q 25 3.6, 50 6.1 Q 75 8.6, 100 4.8"
                            stroke={color}
                            strokeWidth={strokeWidth * 2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            whileInView={{ pathLength: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{
                                duration: animationDuration / 1000,
                                delay: delay / 1000,
                                ease: [0.22, 1, 0.36, 1]
                            }}
                        />
                    </svg>
                </span>
            )
        }

        if (action === "underline") {
            return (
                <span ref={elementRef} className={cn("relative inline-block", className)}>
                    <span className="relative z-10">{children}</span>
                    <svg
                        className="pointer-events-none absolute left-0 bottom-0 w-full h-3 translate-y-0 z-0"
                        viewBox="0 0 300 14"
                        preserveAspectRatio="none"
                        fill="none"
                    >
                        <motion.path
                            d="M6 10.5 C 50 12.5, 150 12.5, 294 8.5"
                            stroke={color}
                            strokeWidth={strokeWidth * 1.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            whileInView={{ pathLength: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{
                                duration: animationDuration / 1000,
                                delay: delay / 1000,
                                ease: "easeOut"
                            }}
                        />
                    </svg>
                </span>
            )
        }

        if (action === "bracket") {
            return (
                <span ref={elementRef} className={cn("relative inline-block px-1.5", className)}>
                    <span className="relative z-10">{children}</span>
                    {/* Left Bracket */}
                    <svg
                        className="pointer-events-none absolute -left-1 top-[-10%] h-[120%] w-3"
                        viewBox="0 0 12 40"
                        preserveAspectRatio="none"
                        fill="none"
                    >
                        <motion.path
                            d="M 10 2 C 2 2, 2 38, 10 38"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            whileInView={{ pathLength: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{
                                duration: animationDuration / 1000,
                                delay: delay / 1000,
                                ease: "easeOut"
                            }}
                        />
                    </svg>
                    {/* Right Bracket */}
                    <svg
                        className="pointer-events-none absolute -right-1 top-[-10%] h-[120%] w-3"
                        viewBox="0 0 12 40"
                        preserveAspectRatio="none"
                        fill="none"
                    >
                        <motion.path
                            d="M 2 2 C 10 2, 10 38, 2 38"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            whileInView={{ pathLength: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{
                                duration: animationDuration / 1000,
                                delay: delay / 1000,
                                ease: "easeOut"
                            }}
                        />
                    </svg>
                </span>
            )
        }
    }

    return (
        <span ref={elementRef} className={cn("relative inline-block bg-transparent", className)}>
            {children}
        </span>
    )
}
