import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HighlightVariant = "purple" | "yellow" | "pink";

interface HighlightTextProps {
    children: ReactNode;
    variant?: HighlightVariant;
    className?: string;
}

export function HighlightText({ children, variant = "yellow", className }: HighlightTextProps) {
    return <span className={cn(`highlight-${variant}`, className)}>{children}</span>;
}
