"use client"

import { ThemeToggle } from "./theme-toggle"

interface AppearanceControlsProps {
  align?: "start" | "center" | "end"
  className?: string
}

export function AppearanceControls({ align = "end", className }: AppearanceControlsProps) {
  return (
    <div className={className ?? "flex items-center gap-1"}>
      <ThemeToggle align={align} />
    </div>
  )
}
