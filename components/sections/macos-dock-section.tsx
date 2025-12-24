"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import MacOSDock, { DockApp } from "@/components/ui/shadcn-io/mac-os-dock";
import { AppleHelloEnglishEffect } from "@/components/ui/apple-hello-effect";

interface MacOSDockSectionProps {
    className?: string;
    id?: string;
    badge?: string;
    title?: React.ReactNode;
    subtitle?: string;
}

const sampleApps: DockApp[] = [
    {
        id: 'finder',
        name: 'Finder',
        icon: 'https://cdn.jim-nielsen.com/macos/1024/finder-2021-09-10.png?rf=1024'
    },
    {
        id: 'notes',
        name: 'Notes',
        icon: 'https://cdn.jim-nielsen.com/macos/1024/notes-2021-05-25.png?rf=1024'
    },
    {
        id: 'bokeh',
        name: 'bokeh',
        icon: '/brand/bokeh_icon.svg',
        iconClassName: "rounded-xl scale-80"
    },
    {
        id: 'safari',
        name: 'Safari',
        icon: 'https://cdn.jim-nielsen.com/macos/1024/safari-2021-06-02.png?rf=1024'
    },
    {
        id: 'photos',
        name: 'Photos',
        icon: 'https://cdn.jim-nielsen.com/macos/1024/photos-2021-05-28.png?rf=1024'
    },
];

export function MacOSDockSection({
    className,
    id = "macos-dock",
    badge = "System Integration",
    title = (
        <div className="flex items-end gap-1 justify-center lg:justify-end">
            <AppleHelloEnglishEffect className="h-12 sm:h-16 w-auto text-foreground" />
            <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-muted-foreground/60 ml-0.5 translate-y-1 sm:translate-y-1">, you</span>
        </div>
    ),
    subtitle = "Thoughtfully designed for macOS.",
}: MacOSDockSectionProps) {
    const [openApps, setOpenApps] = useState<string[]>(['finder', 'bokeh', 'safari']);

    const handleAppClick = (appId: string) => {
        setOpenApps(prev =>
            prev.includes(appId)
                ? prev.filter(id => id !== appId)
                : [...prev, appId]
        );
    };

    return (
        <section
            id={id}
            className={cn("relative py-8 sm:py-12 lg:py-16 px-4 sm:px-6 overflow-hidden", className)}
        >
            <div className="relative mx-auto max-w-6xl">
                {/* Left/Right layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

                    {/* Left: Dock showcase */}
                    <motion.div
                        className="relative order-2 lg:order-1 flex items-center justify-center lg:justify-center py-6"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <MacOSDock
                            apps={sampleApps}
                            onAppClick={handleAppClick}
                            openApps={openApps}
                        />
                    </motion.div>

                    {/* Right: Text content - ALIGNED RIGHT */}
                    <div className="text-center lg:text-right order-1 lg:order-2 flex flex-col items-center lg:items-end">
                        {badge && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4 }}
                            >
                                <Badge
                                    variant="secondary"
                                    className="mb-3 sm:mb-4 bg-violet-50 text-violet-600 border-violet-100"
                                >
                                    {badge}
                                </Badge>
                            </motion.div>
                        )}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.05 }}
                            className="mb-3 sm:mb-4 w-full flex justify-center lg:justify-end"
                        >
                            {title}
                        </motion.div>
                        {subtitle && (
                            <motion.p
                                className="text-sm sm:text-base text-gray-500 max-w-md mx-auto lg:mx-0 lg:ml-auto leading-relaxed"
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: 0.1 }}
                            >
                                {subtitle}
                            </motion.p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
