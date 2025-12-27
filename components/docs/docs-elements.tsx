import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="rounded-md border border-slate-200/80 bg-white/85 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
            {children}
        </kbd>
    );
}

export function ScreenshotPlaceholder({ label }: { label: string }) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-200/80 bg-white/70 p-6 text-slate-400 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.04)_1px,transparent_0)] [background-size:26px_26px]" />
            <div className="relative z-10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Screenshot placeholder</p>
                <p className="mt-3 text-sm text-slate-500">{label}</p>
                <div className="mt-6 h-40 rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-white" />
            </div>
        </div>
    );
}

interface DocCardProps {
    title?: string;
    description?: string;
    eyebrow?: string;
    children?: ReactNode;
    className?: string;
}

export function DocCard({ title, description, eyebrow, children, className }: DocCardProps) {
    return (
        <Card
            className={cn(
                "rounded-2xl border-slate-200/70 bg-white/80 py-0 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12)]",
                className
            )}
        >
            <CardContent className="pt-6">
                {eyebrow && (
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-[family-name:var(--font-geist-mono)]">
                        {eyebrow}
                    </p>
                )}
                {title && <h3 className="mt-2 text-base font-semibold text-slate-900 text-balance">{title}</h3>}
                {description && <p className="mt-2 text-sm text-slate-600 text-balance">{description}</p>}
                {children}
            </CardContent>
        </Card>
    );
}
