"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { Play, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Highlighter } from "@/components/ui/highlighter";

interface HeroSectionProps {
    className?: string;
    badge?: string;
    brandMarkSrc?: string;
    brandMarkAlt?: string;
    title: React.ReactNode;
    subtitle: string;
    primaryCta?: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
    screenshotSrc?: string;
    videoSrc?: string;
    scrollVideoSrc?: string;
    socialProof?: { count: string; label: string };
}

export function HeroSection({
    className,
    badge,
    brandMarkSrc,
    brandMarkAlt = "Brand mark",
    title,
    subtitle,
    primaryCta = { label: "Get started", href: "#" },
    secondaryCta,
    screenshotSrc,
    videoSrc,
    scrollVideoSrc,
}: HeroSectionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const copyRef = useRef<HTMLDivElement>(null);
    const heroWrapRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const heroVideoRef = useRef<HTMLVideoElement>(null);
    const scrollVideoRef = useRef<HTMLVideoElement>(null);
    const [heroVisualReady, setHeroVisualReady] = useState(false);
    const readyRef = useRef({ hero: false, scroll: false });
    const startedRef = useRef(false);
    const heroStartedRef = useRef(false);

    useLayoutEffect(() => {
        if (
            !containerRef.current ||
            !textRef.current ||
            !copyRef.current ||
            !heroWrapRef.current ||
            !workspaceRef.current ||
            !dockRef.current
        ) {
            return;
        }

        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        let timeline: gsap.core.Timeline | null = null;
        const initialScale = 1.5;
        const isTouchDevice =
            ScrollTrigger.isTouch === 1 || ScrollTrigger.isTouch === 2;

        const buildTimeline = () => {
            if (timeline) {
                timeline.scrollTrigger?.kill();
                timeline.kill();
            }

            const hero = heroWrapRef.current as HTMLDivElement;
            const dock = dockRef.current as HTMLDivElement;
            const text = textRef.current as HTMLDivElement;
            const workspace = workspaceRef.current as HTMLDivElement;

            gsap.set(hero, {
                x: 0,
                y: 0,
                scale: initialScale,
                transformOrigin: "center center",
                force3D: true,
                willChange: "transform",
                opacity: 1,
            });
            gsap.set(text, { opacity: 1, y: 0, scale: 1, force3D: true });
            gsap.set(workspace, { opacity: 0, force3D: true, willChange: "opacity" });

            const heroRect = hero.getBoundingClientRect();
            const dockRect = dock.getBoundingClientRect();
            const copyRect = (copyRef.current as HTMLDivElement).getBoundingClientRect();

            const heroCenterX = heroRect.left + heroRect.width / 2;
            const heroCenterY = heroRect.top + heroRect.height / 2;
            const dockCenterX = dockRect.left + dockRect.width / 2;
            const dockCenterY = dockRect.top + dockRect.height / 2;

            const x = dockCenterX - heroCenterX;
            const y = dockCenterY - heroCenterY;
            const scale = dockRect.width / heroRect.width;
            const minGap = window.innerHeight * -0.16;
            const maxGap = window.innerHeight * -0.10;
            const idealGap = copyRect.height * -0.10;
            const startGap = Math.round(gsap.utils.clamp(minGap, maxGap, idealGap));
            const startY = copyRect.bottom + startGap - heroRect.top;

            timeline = gsap.timeline({
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top top",
                    end: () => `+=${Math.round(window.innerHeight * 1.25)}`,
                    scrub: 0.35,
                    pin: true,
                    pinType: isTouchDevice ? "transform" : "fixed",
                    pinSpacing: true,
                    fastScrollEnd: true,
                    anticipatePin: 1,
                    invalidateOnRefresh: true,
                },
            });

            gsap.set(hero, { y: startY });
            timeline.to(hero, { y: 0, duration: 0.3, ease: "none" }, 0);
            timeline.to(text, { opacity: 0, y: 24, scale: 0.9, duration: 0.25, ease: "none" }, 0);
            const dockDuration = 0.3;
            const dockHold = 0.3;

            timeline.to(workspace, { opacity: 1, duration: 0.2, ease: "none" }, 0.15);
            timeline.to(hero, { x, y, scale, duration: dockDuration, ease: "none" }, 0.45);
            timeline.to(hero, { x, y, scale, duration: dockHold, ease: "none" }, 0.45 + dockDuration);
        };

        buildTimeline();

        const refreshHandler = () => buildTimeline();
        ScrollTrigger.addEventListener("refreshInit", refreshHandler);

        let resizeTimeout: NodeJS.Timeout;
        const resizeHandler = () => {
            if (isTouchDevice) return;
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                ScrollTrigger.refresh();
            }, 100);
        };
        window.addEventListener("resize", resizeHandler);

        return () => {
            window.removeEventListener("resize", resizeHandler);
            clearTimeout(resizeTimeout);
            ScrollTrigger.removeEventListener("refreshInit", refreshHandler);
            if (timeline) {
                timeline.scrollTrigger?.kill();
                timeline.kill();
            }
        };
    }, [videoSrc, scrollVideoSrc]);

    useEffect(() => {
        readyRef.current = { hero: false, scroll: false };
        startedRef.current = false;
        heroStartedRef.current = false;
        setHeroVisualReady(false);
    }, [videoSrc, scrollVideoSrc]);

    useEffect(() => {
        heroVideoRef.current?.load();
        scrollVideoRef.current?.load();
    }, [videoSrc, scrollVideoSrc]);

    const startHeroPlayback = () => {
        const hero = heroVideoRef.current;
        if (!hero) return;
        if (heroStartedRef.current) return;
        heroStartedRef.current = true;
        hero.pause();
        hero.currentTime = 0;
        const playHero = hero.play();
        if (playHero !== undefined) playHero.catch(() => { });
    };

    const startScrollWhenHeroReady = () => {
        const hero = heroVideoRef.current;
        const scroll = scrollVideoRef.current;
        if (!hero || !scroll) return;
        if (!readyRef.current.scroll) return;
        if (startedRef.current) return;
        if (hero.currentTime < 0.05) return;
        scroll.pause();
        scroll.currentTime = hero.currentTime;
        const playScroll = scroll.play();
        if (playScroll !== undefined) playScroll.catch(() => { });
        startedRef.current = true;
    };

    const handleHeroLoop = () => {
        const hero = heroVideoRef.current;
        const scroll = scrollVideoRef.current;
        if (!hero || !scroll) return;
        startedRef.current = false;
        heroStartedRef.current = false;
        scroll.pause();
        scroll.currentTime = 0;
        startHeroPlayback();
    };
    return (
        <TooltipProvider delayDuration={0}>
            <section
                ref={containerRef}
                className={cn("relative min-h-[100vh] w-full", className)}
                style={{ minHeight: "100svh" }}
            >
                <div className="relative h-full w-full bg-transparent">
                    <div className="grid h-full w-full grid-rows-[auto,1fr] items-start justify-items-center gap-0 px-4 pb-[2vh] pt-[3vh]">
                        <div
                            ref={textRef}
                            className="w-full max-w-5xl text-center flex flex-col items-center gap-2 mt-[14vh] sm:mt-[8vh] md:mt-[12vh] mb-[0vh] sm:mb-[2vh]"
                        >
                            <div ref={copyRef} className="flex flex-col items-center gap-2">
                                {brandMarkSrc && (
                                    <div className="flex justify-center">
                                        <Image
                                            src={brandMarkSrc}
                                            alt={brandMarkAlt}
                                            width={160}
                                            height={48}
                                            className="h-6 w-auto rounded-xl sm:h-9"
                                            priority
                                        />
                                    </div>
                                )}

                                {badge && (
                                    <div>
                                        <Badge variant="outline" className="px-3 py-1 text-xs sm:text-xs sm:px-3 sm:py-1 font-medium rounded-fullbackdrop-blur-sm bg-background/50 text-foreground">
                                            {badge}
                                        </Badge>
                                    </div>
                                )}

                                <h1
                                    className={cn(
                                        "text-[clamp(2rem,5.4vw,4.25rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-foreground",
                                        "text-balance font-[family-name:var(--font-geist-sans)]",
                                        "[&_em]:italic [&_em]:font-medium [&_em]:text-primary [&_em]:font-[family-name:var(--font-display)]"
                                    )}
                                >
                                    {title}
                                </h1>

                                <p className="text-[clamp(0.85rem,2vw,1.05rem)] text-muted-foreground max-w-2xl mx-auto leading-snug text-balance tracking-[-0.012em]">
                                    {subtitle} <Highlighter action="underline" style="clean" color="#cbd5e1" delay={800}>intentionality</Highlighter> that most tools miss.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-[1vh]">
                                <Button
                                    size="lg"
                                    className="rounded-full h-10 px-6 text-[14px] font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] sm:h-12 sm:px-8 sm:text-[15px]"
                                    asChild
                                >
                                    <a href={primaryCta.href}>
                                        <span className="flex items-center gap-2">
                                            <span className="sm:hidden">Get started</span>
                                            <span className="hidden sm:inline">{primaryCta.label}</span>
                                            <ChevronRight className="w-4 h-4 opacity-70" />
                                        </span>
                                    </a>
                                </Button>
                                {secondaryCta && (
                                    <Button
                                        variant="ghost"
                                        size="lg"
                                        className="hidden sm:flex rounded-full h-12 px-8 text-[15px] font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all duration-300"
                                        asChild
                                    >
                                        <a href={secondaryCta.href}>
                                            <Play className="w-3.5 h-3.5 mr-2 fill-current opacity-80" />
                                            {secondaryCta.label}
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="absolute left-1/2 top-1/2 w-full max-w-[90%] sm:max-w-[65%] md:max-w-[60%] lg:max-w-5xl aspect-[2048/1377] -translate-x-1/2 -translate-y-1/2">
                            <div className="absolute inset-0 z-0">
                                <div className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.2),transparent_68%)] blur-2xl sm:h-[62%] sm:w-[62%]" />
                                <div className="absolute left-[4%] top-[10%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.18),transparent_62%)] blur-3xl sm:left-[12%] sm:top-[18%] sm:h-[48%] sm:w-[48%]" />
                                <div className="absolute right-[2%] bottom-[4%] h-[52%] w-[52%] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.16),transparent_64%)] blur-3xl sm:right-[6%] sm:bottom-[8%] sm:h-[40%] sm:w-[40%]" />
                            </div>
                            <div
                                ref={workspaceRef}
                                className="absolute inset-0 z-10 opacity-0 rounded-lg bg-white/20 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.06)] overflow-hidden"
                            >
                                {scrollVideoSrc && (
                                    <video
                                        ref={scrollVideoRef}
                                        className="h-full w-full rounded-lg object-cover"
                                        style={{ backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        onLoadedMetadata={() => {
                                            readyRef.current.scroll = true;
                                            startScrollWhenHeroReady();
                                        }}
                                    >
                                        <source src={scrollVideoSrc} type="video/webm" />
                                    </video>
                                )}
                            </div>

                            <div
                                ref={dockRef}
                                className="absolute left-[-1%] top-[-7.7%] w-[81.2%] aspect-[337/270] pointer-events-none"
                            />

                            <div className="absolute inset-0 z-20 flex items-center justify-center">
                                <div
                                    ref={heroWrapRef}
                                    className="relative w-[62%] aspect-[337/270] bg-white rounded-lg shadow-2xl overflow-hidden ring-1 ring-black/5 opacity-0"
                                >
                                    {!heroVisualReady && (
                                        <div className="absolute inset-0 z-10 rounded-lg overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-white to-slate-200" />
                                            {screenshotSrc && (
                                                <Image
                                                    src={screenshotSrc}
                                                    alt="Hero preview"
                                                    fill
                                                    className="object-cover scale-[1.01]"
                                                />
                                            )}
                                            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.65)_45%,rgba(255,255,255,0)_70%)] opacity-70 animate-pulse" />
                                        </div>
                                    )}
                                    {videoSrc ? (
                                        <video
                                            ref={heroVideoRef}
                                            className={cn(
                                                "h-full w-full rounded-lg object-cover transition-opacity duration-300",
                                                heroVisualReady ? "opacity-100" : "opacity-0"
                                            )}
                                            style={{ backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            poster={screenshotSrc}
                                            onTimeUpdate={startScrollWhenHeroReady}
                                            onEnded={handleHeroLoop}
                                            onLoadedMetadata={() => {
                                                readyRef.current.hero = true;
                                                startHeroPlayback();
                                            }}
                                            onLoadedData={() => setHeroVisualReady(true)}
                                        >
                                            <source src={videoSrc} type="video/webm" />
                                        </video>
                                    ) : (
                                        screenshotSrc && <Image src={screenshotSrc} alt="Hero" fill className="object-cover" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </TooltipProvider>
    );
}
