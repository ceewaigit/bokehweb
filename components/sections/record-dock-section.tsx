"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef } from "react";
import {
    Monitor,
    AppWindow,
    Crop,
    ChevronDown,
    Mic,
    Eye,
    FolderOpen,
    Pause,
    Square,
    Play,
    Video,
    Volume2,
} from "lucide-react";

interface RecordDockSectionProps {
    className?: string;
    id?: string;
    badge?: string;
    title?: React.ReactNode;
    subtitle?: string;
}

// Simplified spring config for mobile - less stiff, more performant
const springConfig = { type: "spring", stiffness: 300, damping: 25 } as const;
const softSpring = { type: "spring", stiffness: 250, damping: 22 } as const;

// Recording time display - no animation key to prevent flicker
function RecordingTime({ duration }: { duration: number }) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return (
        <span className="text-white/90 text-[12px] sm:text-[13px] font-mono font-medium tabular-nums tracking-tight">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
    );
}

// Source button with hover animation
function SourceButton({
    icon: Icon,
    label,
    isActive,
    hasChevron,
    onClick,
    hideLabel = false
}: {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    label: string;
    isActive: boolean;
    hasChevron?: boolean;
    onClick?: () => void;
    hideLabel?: boolean;
}) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            className={cn(
                "relative flex items-center gap-1.5 h-[28px] sm:h-[32px] px-2 sm:px-2.5 rounded-[6px] sm:rounded-[8px]",
                "text-[10px] sm:text-[11px] font-medium",
                "transition-colors duration-150",
                isActive
                    ? "text-white"
                    : "text-white/50 hover:text-white/80"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
        >
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        className="absolute inset-0 rounded-[6px] sm:rounded-[8px] bg-white/[0.12]"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={springConfig}
                        layoutId="activeSource"
                    />
                )}
            </AnimatePresence>
            <Icon className="relative z-10 w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" strokeWidth={1.5} />
            {!hideLabel && <span className="relative z-10 whitespace-nowrap">{label}</span>}
            {hasChevron && (
                <ChevronDown className="relative z-10 w-2 h-2 sm:w-2.5 sm:h-2.5 opacity-50 -ml-0.5" />
            )}
        </motion.button>
    );
}

// Option toggle button
function OptionButton({
    icon: Icon,
    label,
    isActive,
    onClick
}: {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    label: string;
    isActive: boolean;
    onClick?: () => void;
}) {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            className={cn(
                "relative flex items-center gap-1 h-[24px] sm:h-[28px] px-1.5 sm:px-2 rounded-[5px] sm:rounded-[6px]",
                "text-[9px] sm:text-[10px] font-medium",
                "transition-colors duration-100",
                isActive
                    ? "text-white/80"
                    : "text-white/40 hover:text-white/60"
            )}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={springConfig}
        >
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        className="absolute inset-0 rounded-[5px] sm:rounded-[6px] bg-white/[0.08]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    />
                )}
            </AnimatePresence>
            <Icon className="relative z-10 w-[9px] h-[9px] sm:w-[10px] sm:h-[10px]" strokeWidth={1.75} />
            <span className="relative z-10 whitespace-nowrap">{label}</span>
        </motion.button>
    );
}

// Pulsing record indicator
function RecordingIndicator({ isPaused }: { isPaused: boolean }) {
    return (
        <span className="relative flex h-[5px] w-[5px]">
            {!isPaused && (
                <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-[#ff3b30]"
                    animate={{
                        scale: [1, 1.8, 1],
                        opacity: [0.6, 0, 0.6]
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            )}
            <motion.span
                className="relative inline-flex rounded-full h-[5px] w-[5px]"
                animate={{
                    backgroundColor: isPaused ? "#ff9500" : "#ff3b30"
                }}
                transition={{ duration: 0.2 }}
            />
        </span>
    );
}

// Compact idle state dock mockup
function IdleDockMockup({
    onStartRecording,
    activeSource,
    setActiveSource,
    systemAudio,
    setSystemAudio,
    desktopIcons,
    setDesktopIcons,
    webcamEnabled,
    setWebcamEnabled,
    micEnabled,
    setMicEnabled
}: {
    onStartRecording: () => void;
    activeSource: string;
    setActiveSource: (s: string) => void;
    systemAudio: boolean;
    setSystemAudio: (v: boolean) => void;
    desktopIcons: boolean;
    setDesktopIcons: (v: boolean) => void;
    webcamEnabled: boolean;
    setWebcamEnabled: (v: boolean) => void;
    micEnabled: boolean;
    setMicEnabled: (v: boolean) => void;
}) {
    return (
        <motion.div
            className="inline-flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={softSpring}
        >
            <motion.div
                className={cn(
                    "inline-flex items-center gap-0.5 px-1 py-1 rounded-[10px] sm:rounded-[12px]",
                    "bg-[#1c1c1e]/98 backdrop-blur-xl",
                    "border border-white/[0.06]"
                )}
                layout
            >
                {/* Source Buttons */}
                <SourceButton
                    icon={Monitor}
                    label="Display"
                    isActive={activeSource === 'display'}
                    onClick={() => setActiveSource('display')}
                />
                <SourceButton
                    icon={AppWindow}
                    label="Window"
                    isActive={activeSource === 'window'}
                    hasChevron
                    onClick={() => setActiveSource('window')}
                />
                <SourceButton
                    icon={Crop}
                    label="Area"
                    isActive={activeSource === 'area'}
                    onClick={() => setActiveSource('area')}
                />

                <div className="w-px h-4 sm:h-5 bg-white/[0.08] mx-0.5" />

                {/* Options */}
                <div className="flex items-center gap-1.5">
                    <OptionButton
                        icon={Video}
                        label="Camera"
                        isActive={webcamEnabled}
                        onClick={() => setWebcamEnabled(!webcamEnabled)}
                    />
                    <OptionButton
                        icon={Mic}
                        label="Mic"
                        isActive={micEnabled}
                        onClick={() => setMicEnabled(!micEnabled)}
                    />
                    <OptionButton
                        icon={Volume2}
                        label="System"
                        isActive={systemAudio}
                        onClick={() => setSystemAudio(!systemAudio)}
                    />
                    <OptionButton
                        icon={Eye}
                        label="Desktop"
                        isActive={desktopIcons}
                        onClick={() => setDesktopIcons(!desktopIcons)}
                    />
                </div>

                <div className="w-px h-4 sm:h-5 bg-white/[0.08] mx-0.5" />

                {/* Library Button */}
                <motion.button
                    type="button"
                    className="flex items-center justify-center w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] rounded-[5px] sm:rounded-[6px] text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-all duration-100"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                >
                    <FolderOpen className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px]" strokeWidth={1.75} />
                </motion.button>

                {/* Record Button */}
                <motion.button
                    type="button"
                    onClick={onStartRecording}
                    className={cn(
                        "relative flex items-center justify-center gap-1 sm:gap-1.5 h-[28px] sm:h-[32px] px-2.5 sm:px-3.5 rounded-[6px] sm:rounded-[8px]",
                        "text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.05em] sm:tracking-[0.06em]",
                        "bg-violet-500 text-white",
                        "overflow-hidden"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                >
                    <motion.span
                        className="relative z-10 w-[4px] h-[4px] sm:w-[5px] sm:h-[5px] rounded-full bg-white"
                        animate={{
                            boxShadow: ["0 0 4px rgba(139,92,246,0.4)", "0 0 8px rgba(139,92,246,0.7)", "0 0 4px rgba(139,92,246,0.4)"]
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <span className="relative z-10">Record</span>
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

// Recording state dock mockup
function RecordingDockMockup({
    duration,
    isPaused,
    onPauseResume,
    onStop
}: {
    duration: number;
    isPaused: boolean;
    onPauseResume: () => void;
    onStop: () => void;
}) {
    return (
        <motion.div
            className="inline-block"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={softSpring}
        >
            <motion.div
                className={cn(
                    "inline-flex items-center gap-0.5 px-1 py-1 rounded-[10px] sm:rounded-[12px]",
                    "bg-[#1c1c1e]/98 backdrop-blur-xl",
                    "border border-white/[0.06]"
                )}
                layout
            >
                <div className="flex items-center gap-2 px-2 sm:px-2.5 h-[28px] sm:h-[32px]">
                    <RecordingIndicator isPaused={isPaused} />
                    <RecordingTime duration={duration} />
                </div>

                <div className="w-px h-4 sm:h-5 bg-white/[0.08]" />

                <motion.button
                    type="button"
                    onClick={onPauseResume}
                    className="flex items-center justify-center w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] rounded-[5px] sm:rounded-[6px] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all duration-100"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={springConfig}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isPaused ? "play" : "pause"}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            {isPaused ? <Play className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px] fill-current" /> : <Pause className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px]" />}
                        </motion.div>
                    </AnimatePresence>
                </motion.button>

                <motion.button
                    type="button"
                    onClick={onStop}
                    className={cn(
                        "flex items-center gap-1 h-[24px] sm:h-[28px] px-2 sm:px-2.5 rounded-[5px] sm:rounded-[6px]",
                        "bg-white/[0.08] hover:bg-white/[0.12]",
                        "text-white/85 text-[9px] sm:text-[10px] font-medium",
                        "transition-colors duration-100"
                    )}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springConfig}
                >
                    <Square className="w-[7px] h-[7px] sm:w-[8px] sm:h-[8px] fill-current" />
                    <span>Stop</span>
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

export function RecordDockSection({
    className,
    id = "dock",
    badge = "Start recording",
    title = (
        <>
            Capture anything.<br />
            <em className="highlight-purple">One click.</em>
        </>
    ),
    subtitle = "A floating dock that stays out of your way. Pick your source, hit record, and ship.",
}: RecordDockSectionProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [duration, setDuration] = useState(0);
    const [activeSource, setActiveSource] = useState('display');
    const [systemAudio, setSystemAudio] = useState(true);
    const [desktopIcons, setDesktopIcons] = useState(false);
    const [webcamEnabled, setWebcamEnabled] = useState(false);
    const [micEnabled, setMicEnabled] = useState(true);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const isInView = useInView(sectionRef, { amount: 0.1 });

    const handleStartRecording = () => {
        setIsRecording(true);
        setIsPaused(false);
        setDuration(0);
    };

    const handleStop = () => {
        setIsRecording(false);
        setIsPaused(false);
        setDuration(0);
    };

    // Timer effect
    useEffect(() => {
        if (isRecording && !isPaused) {
            intervalRef.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRecording, isPaused]);

    // Scroll away optimization: reset to idle if out of view
    useEffect(() => {
        if (!isInView && isRecording) {
            handleStop();
        }
    }, [isInView, isRecording]);

    const handlePauseResume = () => {
        setIsPaused(!isPaused);
    };

    return (
        <section
            id={id}
            ref={sectionRef}
            className={cn("relative py-12 sm:py-16 lg:py-24 px-4 sm:px-6 overflow-hidden", className)}
        >
            <div className="relative mx-auto max-w-6xl">
                {/* Left/Right layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

                    {/* Left: Text content */}
                    <div className="text-center lg:text-left order-1">
                        {badge && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4 }}
                            >
                                <Badge
                                    variant="secondary"
                                    className="mb-3 sm:mb-4 bg-red-50 text-red-600 border-red-100"
                                >
                                    {badge}
                                </Badge>
                            </motion.div>
                        )}
                        <motion.h2
                            className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-[-0.02em] leading-[1.15] text-gray-900 mb-3 sm:mb-4 [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 0.05 }}
                        >
                            {title}
                        </motion.h2>
                        {subtitle && (
                            <motion.p
                                className="text-sm sm:text-base text-gray-500 max-w-md mx-auto lg:mx-0 leading-relaxed"
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: 0.1 }}
                            >
                                {subtitle}
                            </motion.p>
                        )}
                    </div>

                    {/* Right: Dock showcase with fade edges */}
                    <motion.div
                        className="relative order-2"
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* Container with fade masks */}
                        <div
                            className="relative flex lg:justify-end overflow-x-auto scrollbar-none lg:-mr-8"
                            style={{
                                maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
                                WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)"
                            }}
                        >
                            {/* Subtle ambient glow behind dock */}
                            <motion.div
                                className="absolute inset-0 pointer-events-none"
                                animate={{
                                    opacity: isRecording ? [0.3, 0.45, 0.3] : 0.25
                                }}
                                transition={{
                                    duration: 2.5,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                style={{
                                    background: isRecording
                                        ? "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(255,59,48,0.06) 0%, transparent 70%)"
                                        : "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(139,92,246,0.05) 0%, transparent 70%)",
                                }}
                            />

                            {/* Dock with minimal padding */}
                            <div className="relative py-6 sm:py-8 px-8 lg:px-12 mx-auto lg:mx-0">
                                <AnimatePresence mode="wait">
                                    {isRecording ? (
                                        <RecordingDockMockup
                                            key="recording"
                                            duration={duration}
                                            isPaused={isPaused}
                                            onPauseResume={handlePauseResume}
                                            onStop={handleStop}
                                        />
                                    ) : (
                                        <IdleDockMockup
                                            key="idle"
                                            onStartRecording={handleStartRecording}
                                            activeSource={activeSource}
                                            setActiveSource={setActiveSource}
                                            systemAudio={systemAudio}
                                            setSystemAudio={setSystemAudio}
                                            desktopIcons={desktopIcons}
                                            setDesktopIcons={setDesktopIcons}
                                            webcamEnabled={webcamEnabled}
                                            setWebcamEnabled={setWebcamEnabled}
                                            micEnabled={micEnabled}
                                            setMicEnabled={setMicEnabled}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Hint */}
                        <motion.p
                            className="text-center lg:text-right text-[10px] sm:text-xs text-gray-400 mt-2 pr-0 lg:pr-4"
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.4 }}
                        >
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={isRecording ? "recording" : "idle"}
                                    initial={{ opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -3 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    {isRecording ? "Click Stop to reset" : "Click to interact"}
                                </motion.span>
                            </AnimatePresence>
                        </motion.p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
