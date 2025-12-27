import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DocCard, Kbd, ScreenshotPlaceholder } from "@/components/docs/docs-elements";

function DocHeader({
    eyebrow,
    title,
    description,
}: {
    eyebrow: string;
    title: string;
    description: string;
}) {
    return (
        <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400 font-[family-name:var(--font-geist-mono)]">
                {eyebrow}
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl page-title text-balance">{title}</h1>
            <p className="mt-4 text-[16px] leading-relaxed text-slate-600 text-balance">{description}</p>
        </header>
    );
}

const quickStartSteps = [
    {
        title: "Install bokeh.",
        description: "Download the latest build, drag it into Applications, and open it.",
    },
    {
        title: "Grant permissions",
        description: "Allow Screen Recording and Microphone for clean capture.",
    },
    {
        title: "Start recording",
        description: "Press Cmd + Shift + 2 to begin a capture from anywhere.",
        shortcut: ["Cmd", "Shift", "2"],
    },
    {
        title: "Stop and polish",
        description: "Press Cmd + Shift + 2 again, then trim or zoom right away.",
        shortcut: ["Cmd", "Shift", "2"],
    },
    {
        title: "Export and share",
        description: "Use Cmd + E to export a clean file ready to share.",
        shortcut: ["Cmd", "E"],
    },
];

const requirements = [
    { title: "macOS 13+", description: "Optimized for Ventura and later." },
    { title: "Apple Silicon or Intel", description: "Runs smoothly across modern Mac hardware." },
    { title: "8 GB RAM", description: "16 GB recommended for long sessions." },
    { title: "2 GB free storage", description: "More if you plan to keep raw recordings." },
];

const recordingOptions = [
    {
        title: "Capture area",
        description: "Full screen, window, or a custom region with smart snapping.",
    },
    {
        title: "Audio sources",
        description: "Mix system audio with a chosen microphone in one pass.",
    },
    {
        title: "Focus behavior",
        description: "Auto-zoom follows clicks and scrolls without manual keyframes.",
    },
    {
        title: "Cursor polish",
        description: "Stabilization, size, and click emphasis for clarity.",
    },
    {
        title: "Countdown & markers",
        description: "3-second countdown plus chapter markers for edits later.",
    },
    {
        title: "Quality presets",
        description: "Balance fidelity and file size with tuned presets.",
    },
];

const editingBasics = [
    { title: "Trim and cut", description: "Slice the start, end, or pauses in one pass." },
    { title: "Transcript edits", description: "Delete words to remove matching video segments." },
    { title: "Audio cleanup", description: "Normalize voice and reduce background noise." },
    { title: "Chapters", description: "Insert section markers for quick navigation." },
];

const zoomOptions = [
    { title: "Auto-zoom intensity", description: "Dial in how aggressively the camera follows focus." },
    { title: "Manual zoom hold", description: "Pin the view during detailed walkthroughs." },
    { title: "Zoom smoothness", description: "Keep motion calm with easing presets." },
];

const exportOptions = [
    { title: "Formats", description: "MP4, MOV, or GIF for fast sharing." },
    { title: "Resolutions", description: "1080p, 1440p, or custom dimensions." },
    { title: "Bitrate control", description: "Tune clarity vs. file size." },
];

const savingOptions = [
    { title: "Auto-save projects", description: "Every edit is saved as you work." },
    { title: "Version history", description: "Create checkpoints before big changes." },
];

const sharingOptions = [
    { title: "Quick share links", description: "Generate a shareable file or link in seconds." },
    { title: "Team handoff", description: "Export with embedded chapters for clarity." },
];

const troubleshootingSteps = [
    {
        title: "Recording is blank",
        description: "Re-check Screen Recording permission in System Settings.",
    },
    {
        title: "No microphone audio",
        description: "Confirm the input device and toggle mic access.",
    },
    {
        title: "Exports look soft",
        description: "Switch to a higher-quality preset and re-export.",
    },
    {
        title: "App won't open",
        description: "Move the app to Applications and reopen it from Finder.",
    },
];

const accountAccess = [
    {
        title: "Activate with a license",
        description: "Paste your key in Settings -> Account to unlock Pro features.",
    },
    {
        title: "Manage seats",
        description: "View active devices and revoke access instantly.",
    },
    {
        title: "Switch accounts",
        description: "Sign out to move your license to another Mac.",
    },
];

function ListCard({ title, items }: { title: string; items: { title: string; description: string }[] }) {
    return (
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-5 text-sm text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <ul className="mt-3 space-y-2">
                {items.map((item) => (
                    <li key={item.title}>
                        <span className="font-semibold text-slate-700">{item.title}:</span> {item.description}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export const docContentMap: Record<string, ReactNode> = {
    "quick-start": (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Quick start"
                title="Record your first capture."
                description="Start with a clean install, grant the right permissions, and capture your screen in minutes."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {quickStartSteps.map((step, index) => (
                    <DocCard key={step.title} eyebrow={`0${index + 1}`} title={step.title} description={step.description}>
                        {step.shortcut && (
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                {step.shortcut.map((key) => (
                                    <Kbd key={key}>{key}</Kbd>
                                ))}
                            </div>
                        )}
                    </DocCard>
                ))}
            </div>
            <ScreenshotPlaceholder label="Quick start flow with install and permission prompts." />
        </section>
    ),
    installing: (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Installing the app"
                title="Set up bokeh. in under two minutes."
                description="bokeh. installs like any other Mac app. Keep the flow fast and friction-free."
            />
            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    "Download the latest build from the website.",
                    "Drag bokeh. into your Applications folder.",
                    "Open it once from Finder to clear macOS warnings.",
                ].map((item) => (
                    <div
                        key={item}
                        className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 text-sm text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                    >
                        {item}
                    </div>
                ))}
            </div>
            <Button asChild size="sm" className="rounded-full px-4 py-2 text-[13px]">
                <Link href="/download">Download the app</Link>
            </Button>
            <ScreenshotPlaceholder label="Installer, Applications folder, and launch confirmation." />
        </section>
    ),
    "system-requirements": (
        <section className="space-y-10">
            <DocHeader
                eyebrow="System requirements"
                title="The Mac hardware we love."
                description="bokeh. runs best on modern macOS devices, with enough memory to keep recordings smooth."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {requirements.map((item) => (
                    <DocCard key={item.title} title={item.title} description={item.description} />
                ))}
            </div>
            <ScreenshotPlaceholder label="Device specs panel and recommended setup." />
        </section>
    ),
    "setup-permissions": (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Setup & permissions"
                title="Give bokeh. the right access."
                description="macOS requires a few approvals for screen capture and audio. bokeh. guides you the first time."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {[
                    {
                        title: "Screen Recording",
                        description: "Required for any capture or window selection.",
                    },
                    {
                        title: "Microphone",
                        description: "Needed if you narrate recordings.",
                    },
                    {
                        title: "Accessibility",
                        description: "Powers auto-zoom and cursor focus.",
                    },
                    {
                        title: "File Access",
                        description: "Lets you choose export destinations.",
                    },
                ].map((item) => (
                    <DocCard key={item.title} title={item.title} description={item.description} />
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                Open System Settings &gt;
                <Kbd>Privacy &amp; Security</Kbd>
                &gt; Screen Recording
            </div>
            <ScreenshotPlaceholder label="Permissions prompt and System Settings panel." />
        </section>
    ),
    activation: (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Activating the app"
                title="Unlock Pro in seconds."
                description="bokeh. works without an account, but a license key unlocks pro exports and premium presets."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {[
                    "Open bokeh. -> Settings -> Account.",
                    "Paste your license key and hit Activate.",
                    "Your Pro features are available instantly.",
                    "Use the same key on another Mac when needed.",
                ].map((item) => (
                    <div
                        key={item}
                        className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 text-sm text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                    >
                        {item}
                    </div>
                ))}
            </div>
            <ScreenshotPlaceholder label="Activation screen with key entry and status." />
        </section>
    ),
    "recording-editing": (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Recording & editing"
                title="Capture, polish, ship."
                description="Use the tabs to switch between recording controls and editing tools."
            />
            <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <input
                    type="radio"
                    id="tab-recording"
                    name="workspace-tabs"
                    defaultChecked
                    className="peer/recording sr-only"
                />
                <input type="radio" id="tab-editing" name="workspace-tabs" className="peer/editing sr-only" />
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-4">
                    <label
                        htmlFor="tab-recording"
                        className="cursor-pointer rounded-full border border-slate-200/80 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 transition-all duration-200 peer-checked/recording:border-slate-900 peer-checked/recording:bg-slate-900 peer-checked/recording:text-white"
                    >
                        Recording
                    </label>
                    <label
                        htmlFor="tab-editing"
                        className="cursor-pointer rounded-full border border-slate-200/80 bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 transition-all duration-200 peer-checked/editing:border-slate-900 peer-checked/editing:bg-slate-900 peer-checked/editing:text-white"
                    >
                        Editing project
                    </label>
                </div>

                <div className="mt-6">
                    <div className="hidden space-y-6 peer-checked/recording:block">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {recordingOptions.map((option) => (
                                <DocCard key={option.title} title={option.title} description={option.description} />
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            Start/stop with
                            <Kbd>Cmd</Kbd>
                            <Kbd>Shift</Kbd>
                            <Kbd>2</Kbd>
                            or pause with
                            <Kbd>Space</Kbd>.
                        </div>
                        <ScreenshotPlaceholder label="Recording dock, capture modes, and audio settings." />
                    </div>

                    <div className="hidden space-y-6 peer-checked/editing:block">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {editingBasics.map((item) => (
                                <DocCard key={item.title} title={item.title} description={item.description} />
                            ))}
                        </div>
                        <div className="grid gap-4 lg:grid-cols-3">
                            <ListCard title="Zooms" items={zoomOptions} />
                            <ListCard title="Export" items={exportOptions} />
                            <ListCard title="Saving & sharing" items={[...savingOptions, ...sharingOptions]} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            Undo changes with
                            <Kbd>Cmd</Kbd>
                            <Kbd>Z</Kbd>
                            and export with
                            <Kbd>Cmd</Kbd>
                            <Kbd>E</Kbd>.
                        </div>
                        <ScreenshotPlaceholder label="Timeline, transcript editor, and export settings." />
                    </div>
                </div>
            </div>
        </section>
    ),
    troubleshooting: (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Troubleshooting"
                title="Fix the common hiccups."
                description="Most issues are permission or export settings. Start here before reaching out."
            />
            <div className="grid gap-4 sm:grid-cols-2">
                {troubleshootingSteps.map((item) => (
                    <DocCard key={item.title} title={item.title} description={item.description} />
                ))}
            </div>
            <ScreenshotPlaceholder label="Troubleshooting checklist and support menu." />
        </section>
    ),
    "account-access": (
        <section className="space-y-10">
            <DocHeader
                eyebrow="Managing account access"
                title="Keep licenses portable and secure."
                description="Move your license between devices or revoke access in seconds."
            />
            <div className="grid gap-4 sm:grid-cols-3">
                {accountAccess.map((item) => (
                    <DocCard key={item.title} title={item.title} description={item.description} />
                ))}
            </div>
            <ScreenshotPlaceholder label="Account panel with active devices and license status." />
        </section>
    ),
};
