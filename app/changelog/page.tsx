"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

interface Change {
    text: string;
    type?: "new" | "improvement" | "fix" | "refactor";
}

interface Version {
    version: string;
    date: string;
    summary: string;
    changes: Change[];
}

const changelogData: Version[] = [
    {
        version: "0.9.4",
        date: "December 24, 2025",
        summary: "Refinements to energy efficiency and background processing.",
        changes: [
            { text: "Significantly reduced battery usage when the app is in the background.", type: "improvement" },
            { text: "Optimized idle state handling for smoother resumption.", type: "fix" }
        ]
    },
    {
        version: "0.9.3",
        date: "December 22, 2025",
        summary: "Visual polish for interaction states and animations.",
        changes: [
            { text: "Smoother transitions when switching between editing modes.", type: "improvement" },
            { text: "Refined hover states for a more tactile feel.", type: "improvement" }
        ]
    },
    {
        version: "0.9.2",
        date: "December 20, 2025",
        summary: "Architecture updates for the visual effects engine.",
        changes: [
            { text: "Improved reliability when applying multiple effects.", type: "refactor" },
            { text: "Better stability for long recording sessions.", type: "improvement" }
        ]
    },
    {
        version: "0.9.1",
        date: "December 18, 2025",
        summary: "New monitoring tools and content creation utilities.",
        changes: [
            { text: "Added performance monitors in settings.", type: "new" },
            { text: "Faster automatic thumbnail generation.", type: "improvement" }
        ]
    },
    {
        version: "0.9.0",
        date: "December 10, 2025",
        summary: "Major layout improvements including Fill Screen mode.",
        changes: [
            { text: "Introduced 'Fill Screen' layout for better focus.", type: "new" },
            { text: "Added social media optimization presets.", type: "new" },
            { text: "Cinematic, smooth video transitions.", type: "new" }
        ]
    },
    {
        version: "0.8.8",
        date: "December 5, 2025",
        summary: "Enhancements to camera motion fluidity.",
        changes: [
            { text: "More natural motion blur during camera movements.", type: "improvement" },
            { text: "Smoother acceleration curves for pans.", type: "improvement" }
        ]
    },
    {
        version: "0.8.7",
        date: "November 28, 2025",
        summary: "Visual feedback updates for interactions.",
        changes: [
            { text: "New polished animation for click events.", type: "new" },
            { text: "Clearer feedback when selecting timeline elements.", type: "improvement" }
        ]
    },
    {
        version: "0.8.6",
        date: "November 24, 2025",
        summary: "Export stability for high-resolution projects.",
        changes: [
            { text: "Ensured perfect clarity for zoomed-in exports.", type: "fix" },
            { text: "Improved export speed for 4K content.", type: "improvement" }
        ]
    },
    {
        version: "0.8.5",
        date: "November 20, 2025",
        summary: "Performance tuning for background rendering.",
        changes: [
            { text: "Fixed potential slowdowns during minimized exports.", type: "fix" },
            { text: "Better memory management for large projects.", type: "improvement" }
        ]
    },
    {
        version: "0.8.4",
        date: "November 15, 2025",
        summary: "Workflow enhancements for multi-clip editing.",
        changes: [
            { text: "Support for importing multiple clips at once.", type: "new" },
            { text: "Streamlined drag-and-drop experience.", type: "improvement" }
        ]
    },
    {
        version: "0.8.3",
        date: "November 12, 2025",
        summary: "Timeline pacing tools and adjustments.",
        changes: [
            { text: "Added 'Spacer' elements for better timing control.", type: "new" },
            { text: "Improved precision when trimming clips.", type: "fix" }
        ]
    },
    {
        version: "0.8.2",
        date: "November 5, 2025",
        summary: "Depth and immersion updates.",
        changes: [
            { text: "Layered parallax background system.", type: "new" },
            { text: "Smoother visibility transitions for the cursor.", type: "new" }
        ]
    },
    {
        version: "0.8.1",
        date: "October 28, 2025",
        summary: "Intelligent audio processing features.",
        changes: [
            { text: "Automated background noise removal.", type: "new" },
            { text: "Smart audio leveling.", type: "improvement" }
        ]
    },
    {
        version: "0.8.0",
        date: "October 20, 2025",
        summary: "Complete UI overhaul to the Glass design language.",
        changes: [
            { text: "Implemented signature Glassmorphic interface.", type: "refactor" },
            { text: "Unified design across all panels.", type: "improvement" }
        ]
    },
    {
        version: "0.7.5",
        date: "October 16, 2025",
        summary: "Recording control improvements.",
        changes: [
            { text: "Pause and resume recording functionality.", type: "new" },
            { text: "Option to auto-hide desktop icons.", type: "new" }
        ]
    },
    {
        version: "0.7.2",
        date: "October 10, 2025",
        summary: "Refinements to editor interactions.",
        changes: [
            { text: "Tools to adjust manual typing speed.", type: "improvement" },
            { text: "Smoother timeline scrubbing.", type: "improvement" }
        ]
    },
    {
        version: "0.7.1",
        date: "October 2, 2025",
        summary: "Onboarding and status visibility improvements.",
        changes: [
            { text: "Minimal recording status overlay.", type: "new" },
            { text: "Simplified setup flow for new users.", type: "new" }
        ]
    },
    {
        version: "0.7.0",
        date: "September 25, 2025",
        summary: "Timeline productivity boost.",
        changes: [
            { text: "Right-click context menus for faster actions.", type: "new" },
            { text: "Precise cursor coordinate data.", type: "new" }
        ]
    },
    {
        version: "0.6.5",
        date: "September 18, 2025",
        summary: "Playback speed controls.",
        changes: [
            { text: "Variable playback speeds (1.5x, 2x).", type: "new" },
            { text: "Audio pitch correction at high speeds.", type: "improvement" }
        ]
    },
    {
        version: "0.6.4",
        date: "September 15, 2025",
        summary: "Library organization updates.",
        changes: [
            { text: "Pagination for the recordings library.", type: "improvement" },
            { text: "Faster load times for large libraries.", type: "improvement" }
        ]
    },
    {
        version: "0.6.3",
        date: "September 8, 2025",
        summary: "Keyboard interaction visualization.",
        changes: [
            { text: "Modifier key visualization during playback.", type: "new" },
            { text: "Improved keystroke animation timing.", type: "fix" }
        ]
    },
    {
        version: "0.6.2",
        date: "September 1, 2025",
        summary: "Shortcut management system.",
        changes: [
            { text: "Comprehensive timeline keyboard shortcuts.", type: "new" },
            { text: "Shortcut reference guide.", type: "new" }
        ]
    },
    {
        version: "0.6.1",
        date: "August 24, 2025",
        summary: "New recording capabilities.",
        changes: [
            { text: "Region selection recording mode.", type: "new" },
            { text: "System audio capture capability.", type: "new" }
        ]
    },
    {
        version: "0.6.0",
        date: "August 15, 2025",
        summary: "Full non-linear editor release.",
        changes: [
            { text: "Timeline with cut and extend tools.", type: "new" },
            { text: "Initial high-quality video export engine.", type: "new" }
        ]
    },
    {
        version: "0.5.5",
        date: "August 8, 2025",
        summary: "Data persistence updates.",
        changes: [
            { text: "New workspace management system.", type: "new" },
            { text: "Auto-save functionality.", type: "new" }
        ]
    },
    {
        version: "0.5.2",
        date: "August 1, 2025",
        summary: "Reliability and undo/redo.",
        changes: [
            { text: "Global undo/redo history.", type: "new" },
            { text: "More robust project saving.", type: "improvement" }
        ]
    },
    {
        version: "0.5.1",
        date: "July 20, 2025",
        summary: "Studio features and polish.",
        changes: [
            { text: "Stealth recording mode.", type: "improvement" },
            { text: "Refined window snapping behavior.", type: "fix" }
        ]
    },
    {
        version: "0.5.0",
        date: "July 10, 2025",
        summary: "Foundational core effect engine.",
        changes: [
            { text: "Screen recording, Zoom, and Cursor effects.", type: "new" },
            { text: "Custom wallpaper backgrounds.", type: "new" }
        ]
    },
    {
        version: "0.4.5",
        date: "July 5, 2025",
        summary: "Internal architecture patterns.",
        changes: [
            { text: "Standardized command patterns.", type: "refactor" },
            { text: "Improved code modularity.", type: "refactor" }
        ]
    },
    {
        version: "0.4.1",
        date: "June 25, 2025",
        summary: "System stability improvements.",
        changes: [
            { text: "Refined crash recovery mechanisms.", type: "fix" },
            { text: "Initial changelog tracking.", type: "new" }
        ]
    },
    {
        version: "0.3.5",
        date: "June 10, 2025",
        summary: "Audio pipeline foundation.",
        changes: [
            { text: "Captured audio data from the microphone.", type: "new" },
            { text: "Synced audio tracks with video frames.", type: "new" },
            { text: "Added a visual meter for input volume.", type: "new" }
        ]
    },
    {
        version: "0.3.0",
        date: "May 20, 2025",
        summary: "Public Alpha release.",
        changes: [
            { text: "Capture engine now runs at 60 frames per second.", type: "new" },
            { text: "Video encoder outputs standard MP4 files.", type: "new" },
            { text: "Added checks for macOS screen recording permissions.", type: "new" }
        ]
    },
    {
        version: "0.2.1",
        date: "April 15, 2025",
        summary: "Internal prototype validation.",
        changes: [
            { text: "Established the main application window.", type: "new" },
            { text: "Connected to the operating system's display server.", type: "new" },
            { text: "Basic loop for capturing screen content.", type: "new" }
        ]
    }
];

export default function ChangelogPage() {
    const [visibleCount, setVisibleCount] = useState(15);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Infinite scroll observer
    useEffect(() => {
        const currentTarget = loadMoreRef.current;
        if (!currentTarget) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + 5, changelogData.length));
                }
            },
            { threshold: 0.1, rootMargin: "100px" }
        );

        observer.observe(currentTarget);

        return () => observer.disconnect();
    }, []);


    return (
        <div className="min-h-screen bg-[#FBFBFD] relative font-sans selection:bg-indigo-500/20">
            {/* Background Gradients */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-slate-50/80 rounded-full blur-[120px] mix-blend-multiply" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px] mix-blend-multiply" />
            </div>

            <main className="relative z-10 mx-auto max-w-2xl px-6 py-24 sm:py-32">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="mb-24 text-center"
                >
                    <Link
                        href="/"
                        className="inline-flex items-center text-[13px] font-medium text-slate-400 hover:text-slate-800 mb-8 transition-colors tracking-wide group"
                    >
                        <ArrowLeft className="mr-2 h-3.5 w-3.5 group-hover:-translate-x-1 transition-transform duration-300" />
                        Back home
                    </Link>
                    <h1 className="text-4xl font-medium font-[family-name:var(--font-display)] tracking-tight text-slate-900 sm:text-5xl mb-6">
                        Product Changelog
                    </h1>
                    <p className="text-lg leading-relaxed text-slate-500 max-w-lg mx-auto font-light">
                        A running history of our improvements, fixes, and new features.
                    </p>
                </motion.div>

                <div className="relative space-y-24">
                    {/* Continuous Timeline Line */}
                    <div className="absolute left-[7px] top-4 bottom-0 w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent hidden md:block" />

                    {changelogData.slice(0, visibleCount).map((release, index) => (
                        <motion.div
                            key={release.version}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="relative md:pl-16 group"
                        >
                            {/* Timeline Dot */}
                            <motion.div
                                className={cn(
                                    "absolute left-0 top-3 h-[15px] w-[15px] rounded-full ring-4 ring-[#FBFBFD] hidden md:block z-10 transition-colors duration-300",
                                    index === 0 ? "bg-slate-900 ring-slate-100/50" : "bg-slate-200 group-hover:bg-slate-400"
                                )}
                            />

                            <div className="flex flex-col mb-6">
                                <div className="flex items-baseline justify-between mb-2">
                                    <h2 className={cn(
                                        "text-xl font-medium tracking-tight font-[family-name:var(--font-display)]",
                                        index === 0 ? "text-slate-900" : "text-slate-800"
                                    )}>
                                        v{release.version}
                                    </h2>
                                    <time className="text-sm text-slate-400 font-mono tracking-wide">
                                        {release.date}
                                    </time>
                                </div>
                                <p className="text-[17px] text-slate-600 leading-relaxed max-w-xl">
                                    {release.summary}
                                </p>
                            </div>

                            <ul className="space-y-3">
                                {release.changes.map((change, i) => (
                                    <li key={i} className="flex items-start gap-3 text-[15px] text-slate-500">
                                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                                        <span>{change.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}

                    {/* Infinite Scroll Trigger */}
                    {visibleCount < changelogData.length && (
                        <div ref={loadMoreRef} className="h-24 flex items-center justify-center opacity-30">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            >
                                <div className="h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" />
                            </motion.div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
