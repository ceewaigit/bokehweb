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
    const [shouldPlay, setShouldPlay] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const pinRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const heroWrapRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const heroVideoRef = useRef<HTMLVideoElement>(null);
    const scrollVideoRef = useRef<HTMLVideoElement>(null);
    const heroMp4Fallback = videoSrc?.endsWith(".webm")
        ? videoSrc.replace(/\.webm$/i, ".mp4")
        : undefined;
    const scrollMp4Fallback = scrollVideoSrc?.endsWith(".webm")
        ? scrollVideoSrc.replace(/\.webm$/i, ".mp4")
        : undefined;

    useLayoutEffect(() => {
        if (
            !containerRef.current ||
            !pinRef.current ||
            !textRef.current ||
            !heroWrapRef.current ||
            !workspaceRef.current ||
            !dockRef.current
        ) {
            return;
        }

        gsap.registerPlugin(ScrollTrigger);

        let timeline: gsap.core.Timeline | null = null;
        const initialScale = 1.5;

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
                y: "26%",
                scale: initialScale,
                transformOrigin: "center center",
            });
            gsap.set(text, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" });
            gsap.set(workspace, { opacity: 0 });

            const heroRect = hero.getBoundingClientRect();
            const dockRect = dock.getBoundingClientRect();

            const heroCenterX = heroRect.left + heroRect.width / 2;
            const heroCenterY = heroRect.top + heroRect.height / 2;
            const dockCenterX = dockRect.left + dockRect.width / 2;
            const dockCenterY = dockRect.top + dockRect.height / 2;

            const x = dockCenterX - heroCenterX;
            const y = dockCenterY - heroCenterY;
            const scale = dockRect.width / heroRect.width;

            timeline = gsap.timeline({
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top top",
                    end: "bottom top",
                    scrub: true,
                    pin: pinRef.current,
                    anticipatePin: 1,
                    pinSpacing: true,
                },
            });

            timeline.to(
                text,
                { opacity: 0, y: 24, scale: 0.95, filter: "blur(10px)", duration: 0.25, ease: "none" },
                0
            );
            timeline.to(workspace, { opacity: 1, duration: 0.35, ease: "none" }, 0.1);
            timeline.to(hero, { x, y, scale, duration: 1, ease: "none" }, 0);
        };

        buildTimeline();

        const refreshHandler = () => buildTimeline();
        ScrollTrigger.addEventListener("refreshInit", refreshHandler);

        const resizeHandler = () => ScrollTrigger.refresh();
        window.addEventListener("resize", resizeHandler);

        const observer = new ResizeObserver(() => {
            buildTimeline();
            ScrollTrigger.refresh();
        });
        observer.observe(containerRef.current);
        observer.observe(pinRef.current);
        observer.observe(workspaceRef.current);

        return () => {
            window.removeEventListener("resize", resizeHandler);
            ScrollTrigger.removeEventListener("refreshInit", refreshHandler);
            if (timeline) {
                timeline.scrollTrigger?.kill();
                timeline.kill();
            }
            observer.disconnect();
        };
    }, [videoSrc, scrollVideoSrc]);

    useEffect(() => {
        const onInteract = () => setShouldPlay(true);
        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                setShouldPlay(true);
            }
        };
        const id = window.setTimeout(() => setShouldPlay(true), 80);
        window.addEventListener("pointerdown", onInteract, { once: true });
        window.addEventListener("touchstart", onInteract, { once: true });
        window.addEventListener("focus", onVisibility);
        window.addEventListener("pageshow", onVisibility);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.clearTimeout(id);
            window.removeEventListener("pointerdown", onInteract);
            window.removeEventListener("touchstart", onInteract);
            window.removeEventListener("focus", onVisibility);
            window.removeEventListener("pageshow", onVisibility);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    useEffect(() => {
        if (!shouldPlay) return;
        const kickstart = (video: HTMLVideoElement | null) => {
            if (!video) return;
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.setAttribute("muted", "");
            video.setAttribute("playsinline", "");
            try {
                video.load();
            } catch {
                // Ignore load errors; play will still be attempted below.
            }
            const playPromise = video.play();
            if (playPromise !== undefined) playPromise.catch(() => { });
        };
        kickstart(heroVideoRef.current);
        kickstart(scrollVideoRef.current);

        const retryInterval = window.setInterval(() => {
            const hero = heroVideoRef.current;
            const scroll = scrollVideoRef.current;
            if (hero && !hero.paused) return;
            if (scroll && !scroll.paused) return;
            kickstart(hero);
            kickstart(scroll);
        }, 500);

        const stopAfter = window.setTimeout(() => {
            window.clearInterval(retryInterval);
        }, 4000);

        return () => {
            window.clearInterval(retryInterval);
            window.clearTimeout(stopAfter);
        };
    }, [shouldPlay, videoSrc, scrollVideoSrc]);

    useEffect(() => {
        const hero = heroVideoRef.current;
        const heroTarget = heroWrapRef.current;
        if (!hero || !heroTarget) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    hero.muted = true;
                    hero.defaultMuted = true;
                    hero.play().catch(() => { });
                }
            },
            { threshold: 0.2 }
        );

        observer.observe(heroTarget);
        return () => observer.disconnect();
    }, [videoSrc]);

    useEffect(() => {
        const scroll = scrollVideoRef.current;
        const scrollTarget = workspaceRef.current;
        if (!scroll || !scrollTarget) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    scroll.muted = true;
                    scroll.defaultMuted = true;
                    scroll.play().catch(() => { });
                }
            },
            { threshold: 0.2 }
        );

        observer.observe(scrollTarget);
        return () => observer.disconnect();
    }, [scrollVideoSrc]);
    return (
        <TooltipProvider delayDuration={0}>
            <section
                ref={containerRef}
                className={cn("relative min-h-[300vh] w-full", className)}
            >
                <div ref={pinRef} className="relative h-screen w-full bg-background">
                    <div className="grid h-full w-full grid-rows-[auto,1fr] items-start justify-items-center gap-0 px-4 pb-[2vh] pt-[3vh]">
                        <div
                            ref={textRef}
                            className="w-full max-w-5xl text-center flex flex-col items-center gap-2 mt-20"
                        >
                            {/* Brand Mark */}
                            {brandMarkSrc && (
                                <div className="flex justify-center">
                                    <Image
                                        src={brandMarkSrc}
                                        alt={brandMarkAlt}
                                        width={160}
                                        height={48}
                                        className="h-9 w-auto rounded-xl sm:h-12"
                                        priority
                                    />
                                </div>
                            )}

                            {/* Badge */}
                            {badge && (
                                <div>
                                    <Badge variant="outline" className="px-3 py-1 text-xs sm:text-sm sm:px-4 sm:py-1.5 font-medium rounded-full border-border/50 backdrop-blur-sm bg-background/50 text-foreground">
                                        {badge}
                                    </Badge>
                                </div>
                            )}

                            {/* Title */}
                            <h1
                                className={cn(
                                    "text-[clamp(2rem,5.4vw,4.25rem)] font-semibold leading-[1.02] text-foreground",
                                    "text-balance font-[family-name:var(--font-geist-sans)]",
                                    "[&_em]:italic [&_em]:font-medium [&_em]:text-primary [&_em]:font-[family-name:var(--font-display)]"
                                )}
                            >
                                {title}
                            </h1>

                            {/* Subtitle */}
                            <p className="text-[clamp(0.85rem,2vw,1.05rem)] text-muted-foreground max-w-2xl mx-auto leading-snug text-balance tracking-[-0.012em]">
                                {subtitle}
                            </p>

                            {/* CTAs */}
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                                <div className="hidden sm:block">
                                    <Button
                                        size="lg"
                                        className="rounded-full h-10 px-6 text-[14px] font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] sm:h-12 sm:px-8 sm:text-[15px]"
                                        asChild
                                    >
                                        <a href={primaryCta.href}>
                                            <span className="flex items-center gap-2">
                                                {primaryCta.label} <ChevronRight className="w-4 h-4 opacity-70" />
                                            </span>
                                        </a>
                                    </Button>
                                </div>
                                {secondaryCta && (
                                    <Button
                                        variant="ghost"
                                        size="lg"
                                        className="rounded-full h-10 px-6 text-[14px] font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all duration-300 sm:h-12 sm:px-8 sm:text-[15px]"
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

                        <div className="relative w-full max-w-5xl aspect-[2048/1377] max-h-[70vh] self-start -mt-8 sm:-mt-16">
                            {(videoSrc || heroMp4Fallback) && (
                                <video
                                    aria-hidden="true"
                                    tabIndex={-1}
                                    className="absolute w-0 h-0 opacity-0 pointer-events-none"
                                    muted
                                    playsInline
                                    autoPlay
                                    loop
                                    preload="auto"
                                >
                                    {heroMp4Fallback && <source src={heroMp4Fallback} type="video/mp4" />}
                                    {videoSrc && <source src={videoSrc} type="video/webm" />}
                                </video>
                            )}
                            <div
                                ref={workspaceRef}
                                className="absolute inset-0 z-10 opacity-0 rounded-lg border border-white/40 bg-white/20 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.06)] p-2 sm:p-3"
                            >
                                {scrollVideoSrc && (
                                    <video
                                        ref={scrollVideoRef}
                                        className="h-full w-full rounded-lg object-cover"
                                        muted
                                        playsInline
                                        autoPlay
                                        loop
                                        preload="auto"
                                            onLoadedMetadata={() => {
                                                if (shouldPlay) {
                                                    scrollVideoRef.current?.play().catch(() => { });
                                                }
                                            }}
                                            onCanPlayThrough={() => {
                                                if (shouldPlay) {
                                                    scrollVideoRef.current?.play().catch(() => { });
                                                }
                                            }}
                                            onCanPlay={() => {
                                                if (shouldPlay) {
                                                    scrollVideoRef.current?.play().catch(() => { });
                                                }
                                            }}
                                    >
                                        <source src={scrollVideoSrc} type="video/webm" />
                                        {scrollMp4Fallback && <source src={scrollMp4Fallback} type="video/mp4" />}
                                    </video>
                                )}
                            </div>

                            {/* Dock Target (invisible) */}
                            <div
                                ref={dockRef}
                                className="absolute left-[-1%] top-[11.5%] w-[81.2%] aspect-[337/270] pointer-events-none"
                            />

                            {/* 2. HERO FOREGROUND (Visible initially) */}
                            <div className="absolute inset-0 z-20 flex items-center justify-center">
                                <div
                                    ref={heroWrapRef}
                                    className="relative w-[62%] aspect-[337/270] bg-white rounded-lg shadow-2xl overflow-hidden ring-1 ring-black/5"
                                >
                                    {videoSrc ? (
                                        <video
                                            ref={heroVideoRef}
                                            className="h-full w-full rounded-lg object-cover"
                                            muted
                                            playsInline
                                            autoPlay
                                            loop
                                            preload="auto"
                                            poster={screenshotSrc}
                                                onLoadedMetadata={() => {
                                                    if (shouldPlay) {
                                                        heroVideoRef.current?.play().catch(() => { });
                                                    }
                                                }}
                                                onCanPlayThrough={() => {
                                                    if (shouldPlay) {
                                                        heroVideoRef.current?.play().catch(() => { });
                                                    }
                                                }}
                                                onCanPlay={() => {
                                                    if (shouldPlay) {
                                                        heroVideoRef.current?.play().catch(() => { });
                                                    }
                                            }}
                                        >
                                            <source src={videoSrc} type="video/webm" />
                                            {heroMp4Fallback && <source src={heroMp4Fallback} type="video/mp4" />}
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
