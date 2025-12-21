import { cn } from "@/lib/utils";

interface SectionBackdropProps {
    variant?: "dots" | "grid" | "gradient" | "plus" | "cross-dots";
    color?: string;
    className?: string;
    fade?: "bottom" | "top" | "x" | "y" | "radial" | "all" | "none";
    texture?: boolean;
}

export function SectionBackdrop({
    variant = "dots",
    color,
    className,
    fade = "bottom",
    texture = false,
}: SectionBackdropProps) {
    // Default colors if not provided
    const dotColor = color || "rgba(15,23,42,0.08)"; // Slate-900 at 8% opacity

    // Mask styles based on fade prop
    const maskStyles = {
        bottom: "linear-gradient(to bottom, black 40%, transparent 100%)",
        top: "linear-gradient(to top, black 40%, transparent 100%)",
        x: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
        y: "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
        radial: "radial-gradient(circle at center, black 40%, transparent 100%)",
        all: "radial-gradient(ellipse 60% 50% at center, black 40%, transparent 100%)",
        none: "none",
    };

    return (
        <div
            className={cn("absolute inset-0 pointer-events-none -z-10", className)}
            style={{
                maskImage: maskStyles[fade],
                WebkitMaskImage: maskStyles[fade],
            }}
        >
            {/* Texture overlay */}
            {texture && (
                <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundSize: '128px 128px'
                    }}
                />
            )}

            {/* Dots pattern */}
            {variant === "dots" && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, ${dotColor} 1px, transparent 0)`,
                        backgroundSize: "24px 24px",
                    }}
                />
            )}

            {/* Grid pattern */}
            {variant === "grid" && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, ${dotColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${dotColor} 1px, transparent 1px)
                        `,
                        backgroundSize: "40px 40px",
                    }}
                />
            )}

            {/* Plus pattern */}
            {variant === "plus" && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, ${dotColor} 1px, transparent 1px),
                            linear-gradient(to bottom, ${dotColor} 1px, transparent 1px)
                        `,
                        backgroundSize: "60px 60px",
                        maskImage: "radial-gradient(circle at center, black 3px, transparent 4px)",
                        WebkitMaskImage: "radial-gradient(circle at center, black 3px, transparent 4px)",
                        maskSize: "60px 60px",
                        WebkitMaskSize: "60px 60px",
                    }}
                >
                    {/* Alternative implementation if mask trick is tricky, but let's try a simpler plus svg bg */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 11H5V13H11V19H13V13H19V11H13V5H11V11Z' fill='${encodeURIComponent(dotColor)}'/%3E%3C/svg%3E")`,
                            backgroundSize: '48px 48px'
                        }}
                    />
                </div>
            )}

            {/* Cross-dots pattern */}
            {variant === "cross-dots" && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            radial-gradient(circle at 2px 2px, ${dotColor} 2px, transparent 0),
                            url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0V20M0 10H20' stroke='${encodeURIComponent(dotColor)}' stroke-width='0.5'/%3E%3C/svg%3E")
                        `,
                        backgroundSize: "40px 40px, 80px 80px",
                        backgroundPosition: "0 0, 20px 20px"
                    }}
                />
            )}

            {/* Gradient wash */}
            {variant === "gradient" && (
                <div
                    className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,var(--primary-light,rgba(139,92,246,0.15)),transparent_70%)]"
                />
            )}
        </div>
    );
}
