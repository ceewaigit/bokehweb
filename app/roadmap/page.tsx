import { cn } from "@/lib/utils";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface RoadmapItem {
    title: string;
    description: string;
    status: "in-progress" | "planned" | "consideration";
    quarter?: string;
}

const roadmapData: Record<string, RoadmapItem[]> = {
    "In Progress": [
        {
            title: "Recording Teleprompter",
            description: "Scrolls your script in sync while you record, with smart pace controls.",
            status: "in-progress",
            quarter: "Q4 2025"
        },
        {
            title: "Chapter Markers",
            description: "Drop markers mid-take and jump between sections instantly.",
            status: "in-progress"
        },
        {
            title: "Template Presets",
            description: "Save reusable show setups for intros, outros, and recurring segments.",
            status: "in-progress"
        }
    ],
    "Planned": [
        {
            title: "One-Click Exports",
            description: "Export optimized files for popular podcast and video platforms.",
            status: "planned",
            quarter: "Q1 2026"
        },
        {
            title: "Notes to Outline",
            description: "Turn rough notes into a clear rundown you can follow on mic.",
            status: "planned"
        },
        {
            title: "Auto-Generated Titles",
            description: "Quickly draft episode titles from your recording highlights.",
            status: "planned"
        }
    ],
    "Under Consideration": [
        {
            title: "Guest Mode",
            description: "Temporary profiles for co-hosts and guests without full setup.",
            status: "consideration"
        },
        {
            title: "Capture Checklist",
            description: "Pre-record checklist to avoid missed mic or routing issues.",
            status: "consideration"
        }
    ]
};

function StatusBadge({ status }: { status: RoadmapItem["status"] }) {
    const styles = {
        "in-progress": "bg-indigo-100 text-indigo-700 border-indigo-200",
        "planned": "bg-slate-100 text-slate-700 border-slate-200",
        "consideration": "bg-emerald-100 text-emerald-700 border-emerald-200"
    };

    const labels = {
        "in-progress": "In Progress",
        "planned": "Planned",
        "consideration": "Considering"
    };

    return (
        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", styles[status])}>
            {labels[status]}
        </span>
    );
}

export default function RoadmapPage() {
    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            {/* Artistic Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-50/50 rounded-full blur-[120px] opacity-60" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50/50 rounded-full blur-[120px] opacity-60" />
            </div>

            <div className="relative mx-auto max-w-4xl px-6 py-24 sm:py-32">
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
                        Roadmap
                    </h1>
                    <p className="text-[17px] leading-relaxed text-slate-500 max-w-lg mx-auto">
                        A clear view of what we’re building next.
                    </p>
                </div>

                <div className="grid gap-12 md:gap-16">
                    {Object.entries(roadmapData).map(([category, items]) => (
                        <div key={category}>
                            <h2 className="text-xl font-medium text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                                {category}
                                <span className="h-px flex-1 bg-slate-200" />
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {items.map((item, index) => (
                                    <div
                                        key={index}
                                        className="group relative bg-white/60 hover:bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 hover:border-indigo-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <StatusBadge status={item.status} />
                                            {item.quarter && (
                                                <span className="text-xs font-medium text-slate-400">
                                                    {item.quarter}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                                            {item.title}
                                        </h3>
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {item.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
