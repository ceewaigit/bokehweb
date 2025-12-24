"use client";

import { cn } from "@/lib/utils";
import React from "react";

interface NeumorphicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    active?: boolean;
}

export const NeumorphicButton = React.forwardRef<HTMLButtonElement, NeumorphicButtonProps>(
    ({ className, children, active, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "px-5 py-2.5 rounded-full flex items-center justify-center gap-2 cursor-pointer",
                    "text-[13px] font-medium tracking-[0.02em] text-slate-600",
                    "bg-slate-100",
                    "shadow-[-5px_-5px_10px_rgba(255,255,255,0.8),5px_5px_10px_rgba(0,0,0,0.1)]",
                    "transition-all duration-300 ease-out",
                    "hover:shadow-[-2px_-2px_5px_rgba(255,255,255,0.6),2px_2px_5px_rgba(0,0,0,0.1),inset_-2px_-2px_5px_rgba(255,255,255,0.5),inset_2px_2px_4px_rgba(0,0,0,0.05)]",
                    "hover:text-primary hover:-translate-y-[1px]",
                    "active:shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.1)]",
                    "active:translate-y-[1px]",
                    // Active state style if needed (e.g. current page)
                    active && "text-primary shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.1)]",
                    className
                )}
                {...props}
            >
                {children}
            </button>
        );
    }
);
NeumorphicButton.displayName = "NeumorphicButton";
