"use client"

import { Sun, Moon, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/contexts/theme-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  align?: "start" | "center" | "end"
  className?: string
  buttonClassName?: string
}

export function ThemeToggle({
  align = "end",
  className,
  buttonClassName,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 hover:bg-background/50", buttonClassName)}
        >
          {theme === "light" && <Sun className="w-3.5 h-3.5" />}
          {theme === "dark" && <Moon className="w-3.5 h-3.5" />}
          {theme === "system" && <Monitor className="w-3.5 h-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn("w-32", className)}>
        <DropdownMenuItem onClick={() => setTheme("light")} className="text-xs">
          <Sun className="w-3 h-3 mr-2" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="text-xs">
          <Moon className="w-3 h-3 mr-2" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="text-xs">
          <Monitor className="w-3 h-3 mr-2" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

