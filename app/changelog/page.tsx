import { cn } from "@/lib/utils";
import Link from "next/link";

interface Change {
    description: string;
    type?: "new" | "improvement" | "fix" | "refactor";
}

interface Version {
    version: string;
    date?: string;
    changes: Change[];
    isMajor?: boolean;
}

const changelogData: Version[] = [
    {
        version: "1.0.0",
        date: "Current",
        isMajor: true,
        changes: [
            { description: "Official Release", type: "new" },
        ]
    },
    {
        version: "0.9.8",
        changes: [
            { description: "Final pre-release stability polish", type: "improvement" },
            { description: "Enhanced rendering engine performance on M2 chips", type: "improvement" },
            { description: "Updated default templates collection", type: "new" },
        ]
    },
    {
        version: "0.9.5",
        changes: [
            { description: "Webcam timeline integration for simplified user experience", type: "new" },
            { description: "Rebranding: Updated project file format and naming conventions", type: "refactor" },
            { description: "Text overlays with motion, blur masking, and scene transitions", type: "new" },
            { description: "Text-based editing functionality", type: "new" },
        ]
    },
    {
        version: "0.9.2",
        changes: [
            { description: "Improved export rendering speeds for 4K video", type: "improvement" },
            { description: "Fixed thumbnail generation caching issue", type: "fix" },
            { description: "Refined padding on text overlays", type: "improvement" },
        ]
    },
    {
        version: "0.9.0",
        changes: [
            { description: "Video fill screen mode (faux 1.5x zoom)", type: "new" },
            { description: "Thumbnail generation from frame", type: "new" },
            { description: "Aspect ratio adjustments with presets (Landing Page, Hero)", type: "new" },
            { description: "Video fade in/out effects", type: "new" },
            { description: "Performance optimization for idle video functionality", type: "improvement" },
            { description: "Community template logic refactor for generic parameter handling", type: "refactor" },
        ]
    },
    {
        version: "0.8.5",
        changes: [
            { description: "Enhanced audio waveform visualization in timeline", type: "new" },
            { description: "Added new keyboard shortcuts for quick zoom levels", type: "new" },
            { description: "Resolved memory usage in extended recording sessions", type: "fix" },
        ]
    },
    {
        version: "0.8.0",
        changes: [
            { description: "Glassmorphic design system implementation", type: "refactor" },
            { description: "Layered parallax background support", type: "new" },
            { description: "Auto audio cleanup", type: "new" },
            { description: "Pause and resume recording functionality", type: "new" },
            { description: "Multi-clip support with metadata import", type: "new" },
            { description: "Mouse fade in/out animations", type: "new" },
            { description: "Support for blank screens/spacers between clips", type: "new" },
            { description: "High-resolution zoom on export", type: "improvement" },
            { description: "Motion blur for camera movement", type: "new" },
            { description: "Video crop functionality", type: "new" },
            { description: "Desktop icons and widgets hiding capability", type: "new" },
            { description: "Mouse click animations", type: "new" },
            { description: "Optimized export performance when minimized", type: "improvement" },
        ]
    },
    {
        version: "0.7.5",
        changes: [
            { description: "Smoother transition animations between zoom states", type: "improvement" },
            { description: "Added 'Reset to Default' option for all effect settings", type: "new" },
            { description: "Improved tooltip visibility and timing", type: "improvement" },
        ]
    },
    {
        version: "0.7.0",
        changes: [
            { description: "Context menu for timeline operations", type: "new" },
            { description: "Original cursor recording support", type: "new" },
            { description: "Glassmorphic overlay during recording", type: "new" },
            { description: "Welcome screen with permissions request", type: "new" },
            { description: "Typing speed-up functionality", type: "improvement" },
        ]
    },
    {
        version: "0.6.5",
        changes: [
            { description: "Added support for GIF export", type: "new" },
            { description: "Custom frame rate selection (30/60 fps)", type: "new" },
            { description: "Added estimated file size indicator before export", type: "new" },
        ]
    },
    {
        version: "0.6.0",
        changes: [
            { description: "Timeline video editing (cut, extend)", type: "new" },
            { description: "Audio capabilities support", type: "new" },
            { description: "Partial screen recording support", type: "new" },
            { description: "Keyboard shortcuts for timeline", type: "new" },
            { description: "Keyboard action collection and display", type: "new" },
            { description: "Recordings library pagination", type: "new" },
            { description: "Export functionality (Beta)", type: "new" },
            { description: "Speed up feature", type: "new" },
        ]
    },
    {
        version: "0.5.5",
        changes: [
            { description: "Snap-to-grid enhancement on timeline", type: "improvement" },
            { description: "Multi-select clips support", type: "new" },
            { description: "Drag and drop improvements in media library", type: "improvement" },
        ]
    },
    {
        version: "0.5.0",
        changes: [
            { description: "High-fidelity screen recording engine", type: "new" },
            { description: "Smart zoom capabilities to highlight key details", type: "new" },
            { description: "Professional cursor overlay system", type: "new" },
            { description: "Customizable wallpaper backgrounds", type: "new" },
            { description: "Full undo/redo history with keyboard support", type: "new" },
            { description: "Option to auto-hide recording controls", type: "improvement" },
            { description: "Streamlined workflow: Record → Library → Workspace", type: "new" },
            { description: "Robust project saving and management", type: "new" },
            { description: "Enhanced application stability and performance", type: "improvement" },
        ]
    },
    {
        version: "0.4.5",
        changes: [
            { description: "Cloud sync preparation updates", type: "refactor" },
            { description: "Reduced CPU usage during idle state", type: "improvement" },
            { description: "Added new onboarding hints for first-time users", type: "new" },
        ]
    },
    {
        version: "0.4.1",
        changes: [
            { description: "Significant performance improvements for long recordings", type: "improvement" },
            { description: "UI polish and visual refinements across the editor", type: "improvement" },
            { description: "Internal architecture updates", type: "refactor" },
        ]
    },
    {
        version: "0.3.0",
        changes: [
            { description: "Initial beta release", type: "new" },
            { description: "Basic timeline editing capabilities", type: "new" },
            { description: "System audio capture integration", type: "new" },
        ]
    },
    {
        version: "0.2.0",
        changes: [
            { description: "Native macOS integration", type: "new" },
            { description: "High-performance recording engine rewrite", type: "refactor" },
            { description: "Added support for external microphone sources", type: "new" },
        ]
    },
    {
        version: "0.1.0",
        changes: [
            { description: "Initial prototype presentation", type: "new" },
            { description: "Basic screen capture functionality", type: "new" },
            { description: "4K 60fps recording support", type: "new" },
        ]
    }
];

export default function ChangelogPage() {
    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            {/* Artistic Background - Subtle, clean, Apple-esque */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-50/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-50/50 rounded-full blur-[120px] opacity-60" />
            </div>

            <div className="relative mx-auto max-w-3xl px-6 py-24 sm:py-32">
                <div className="mb-20 text-center">
                    <Link
                        href="/"
                        className="inline-flex items-center text-[13px] font-medium text-slate-500 hover:text-slate-900 mb-8 transition-colors tracking-wide"
                    >
                        <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back home
                    </Link>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl mb-4 font-display">
                        Changelog
                    </h1>
                    <p className="text-[17px] leading-relaxed text-slate-500 max-w-lg mx-auto">
                        Updates, improvements, and polish across the app.
                    </p>
                </div>

                <div className="relative space-y-16">
                    {/* Vertical Line */}
                    <div className="absolute left-[3px] top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent hidden sm:block" />

                    {changelogData.map((release, index) => (
                        <div key={release.version} className="relative sm:pl-12 group">
                            {/* Dot on timeline */}
                            <div className={cn(
                                "absolute left-0 top-2.5 h-[7px] w-[7px] rounded-full bg-white ring-4 ring-[#FBFBFD] border transition-colors duration-500 hidden sm:block z-10",
                                index === 0 ? "border-indigo-500 bg-indigo-500 ring-indigo-50" : "border-slate-300 group-hover:border-indigo-400"
                            )} />

                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6">
                                <h2 className={cn(
                                    "text-2xl font-semibold tracking-tight",
                                    index === 0 ? "text-slate-900" : "text-slate-700"
                                )}>
                                    v{release.version}
                                </h2>
                                {release.date && (
                                    <span className="text-[13px] font-medium text-slate-400 mt-1 sm:mt-0">
                                        {release.date}
                                    </span>
                                )}
                            </div>

                            <div className="relative">
                                <ul className="space-y-3">
                                    {release.changes.map((change, i) => (
                                        <li key={i} className="flex items-start gap-4 text-slate-600 transition-colors duration-200">
                                            {/* Bullet */}
                                            <span className="mt-2 h-1 w-1 rounded-full bg-slate-300 flex-shrink-0 group-hover/li:bg-indigo-400 transition-colors" />
                                            <span className="text-[15px] leading-relaxed font-light text-slate-600">
                                                {change.description}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
