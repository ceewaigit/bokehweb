"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DocsSidebar() {
    const pathname = usePathname();

    return (
        <Card className="rounded-3xl border-slate-200/60 bg-white/75 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-900">Documentation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 px-4 pb-5">
                <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                        "w-full h-auto items-start justify-start flex-wrap whitespace-normal text-left leading-snug text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 py-2",
                        pathname === "/docs" && "bg-slate-100/70 text-slate-900"
                    )}
                >
                    <Link href="/docs">Overview</Link>
                </Button>
                {docsNav.map((item) => {
                    const href = `/docs/${item.slug}`;
                    const isActive = pathname === href;
                    return (
                        <Button
                            key={item.slug}
                            variant="ghost"
                            size="sm"
                            asChild
                            className={cn(
                                "w-full h-auto items-start justify-start flex-wrap whitespace-normal text-left leading-snug text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 py-2",
                                isActive && "bg-slate-100/70 text-slate-900"
                            )}
                        >
                            <Link href={href}>{item.title}</Link>
                        </Button>
                    );
                })}
            </CardContent>
        </Card>
    );
}
