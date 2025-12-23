"use client";

import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "@/components/sections/hero-section";
import { SocialProofSection } from "@/components/sections/social-proof-section";
import { FeatureShowcaseSection } from "@/components/sections/feature-showcase-section";
import { FeatureGrid } from "@/components/sections/feature-grid";
import { TestimonialSection } from "@/components/sections/testimonial-section";
import { QASection } from "@/components/sections/qa-section";
import { CTASection } from "@/components/sections/cta-section";
import { SpeedComparisonSection } from "@/components/sections/speed-comparison-section";
import { EditingFeaturesSection } from "@/components/sections/editing-features-section";

import {
  Clock,
  Command,
  Crop,
  Keyboard,
  Type,
  KeyRound,
  Wand2,
  Layers,
  MousePointer,
  Palette,
  Box,
  FileVideo,
  Download,
  WifiOff
} from "lucide-react";
import PricingSection from "@/components/sections/pricing-section";

const features = [
  {
    icon: Clock,
    title: "Idle cleanup",
    description: "Silence, skipped. Automatically tighten pacing.",
  },
  {
    icon: Command,
    title: "Keyboard shortcuts",
    description: "Native fluency. Shortcuts that match your muscle memory.",
  },
];

const showcaseFeatures = [
  {
    icon: Box,
    title: "Cinematic depth",
    description: "Instant production value. Add 3D depth and polish with a single click.",
    image: "/features/3d.png",
    imagePlacement: "bottom" as const,
    backdrop: "dots" as const,
    span: "sm" as const,
    imageClassName: "w-[90%] max-h-[100px] object-contain object-bottom",
  },
  {
    icon: FileVideo,
    title: "Bring your media in",
    description: "Drag, drop, done. Layer context without fighting a complex timeline.",
    image: "/features/import.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: MousePointer,
    title: "Stabilized cursor",
    description: "Liquid motion. A cursor that glides, never jitters.",
    image: "/features/arrow.png",
    imagePlacement: "middle" as const,
    textPosition: "right" as const,
    backdrop: "grid" as const,
    span: "lg" as const,
    isGraphic: true,
    imageClassName: "w-[70%] max-h-[180px] object-contain",
    interactive: "cursor-follow" as const,
  },
  {
    icon: Layers,
    title: "Brand-ready backgrounds",
    description: "On-brand, always. Backgrounds that fit your guidelines instantly.",
    video: "/features/wallpaper.mp4",
    imagePlacement: "top" as const,
    textPosition: "left" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: Palette,
    title: "Deep control when you want it",
    description: "Power when you need it. Smart defaults for speed, granular control for perfection.",
    image: "/features/advanced.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
  {
    icon: Crop,
    title: "Social-ready sizes",
    description: "Ship everywhere. Instantly reframe for TikTok, Reels, and Slack.",
    image: "/features/crop.png",
    imagePlacement: "middle" as const,
    backdrop: "dots" as const,
    span: "sm" as const,
  },
  {
    icon: WifiOff,
    title: "Offline-first privacy",
    description: "Private by design. Your recordings never leave your Mac.",
    isGraphic: true,
    imageClassName: "opacity-40",
    backdrop: "grid" as const,
    span: "sm" as const,
  },
];

const testimonials = [
  {
    content: "Bokeh takes messy recordings and turns them into polished walkthroughs in minutes.",
    author: { name: "Avery Chen", title: "Product Manager, Apple" },
  },
  {
    content: "No timeline, no fuss. I record, let bokeh polish, and ship.",
    author: { name: "Priya Kapoor", title: "Software Engineer, Google" },
  },
  {
    content: "Auto-zoom and cleanup make onboarding videos crisp and easy to follow.",
    author: { name: "Marcus Lee", title: "Program Manager, Microsoft" },
  },
  {
    content: "Our support team ships studio-quality recordings without the studio.",
    author: { name: "Elena Torres", title: "Customer Support Lead, Amazon" },
  },
  {
    content: "It is the only recorder our team actually enjoys using.",
    author: { name: "Jonas Wright", title: "Product Manager, Meta" },
  },
  {
    content: "Cursor smoothing and export quality make every recording feel expensive.",
    author: { name: "Naomi Park", title: "Student, Apple Developer Academy" },
  },
];

const faqs = [
  {
    question: "Is this a video editor like Final Cut or DaVinci?",
    answer: "No. bokeh focuses on the 90% of edits screen recordings actually need: remove mistakes fast, keep the video clean, and export something that looks polished.",
  },
  {
    question: "Do I need an account?",
    answer: "No account required to start. The app is designed to work locally first.",
  },
  {
    question: "Can I share to my team?",
    answer: "Yes. Export a file and share it using whatever your team already uses today.",
  },
  {
    question: "What is the transcript editing part?",
    answer: "You edit the words, and the video follows. Delete a sentence, and that part is cut from the recording.",
  },
  {
    question: "Is my data private?",
    answer: "Yes. Processing happens locally on your Mac. No cloud uploads, no third-party access.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes. Download and start recording immediately. No credit card required.",
  },
  {
    question: "What platforms does bokeh support?",
    answer: "macOS on Apple Silicon. Windows is on the roadmap.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-white overflow-x-hidden">
      <Navbar />

      {/* Unified background wrapper for seamless section blending */}
      <main className="relative">
        <div className="absolute inset-0 pointer-events-none z-0 page-backdrop" />
        <div className="absolute inset-0 pointer-events-none z-0">
          <div
            className="gradient-orb h-[520px] w-[520px] left-[-8%] top-[6vh]"
            style={{ background: "radial-gradient(circle, rgba(139, 92, 246, 0.14) 0%, transparent 65%)" }}
          />
          <div
            className="gradient-orb h-[460px] w-[460px] right-[-6%] top-[16vh]"
            style={{ background: "radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 65%)" }}
          />
          <div
            className="gradient-orb h-[440px] w-[440px] left-[-4%] top-[185vh]"
            style={{ background: "radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 66%)" }}
          />
          <div
            className="gradient-orb h-[420px] w-[420px] right-[-6%] top-[420vh]"
            style={{ background: "radial-gradient(circle, rgba(14, 165, 233, 0.1) 0%, transparent 66%)" }}
          />
        </div>

        {/* Sections with transparent backgrounds - they blend into the global gradient */}
        <div className="relative z-10">
          <HeroSection
            badge="Early access"
            brandMarkSrc="/brand/bokeh_logo.svg"
            brandMarkAlt="bokeh logo"
            title={
              <>
                The screen recorder<br />
                <em className="highlight-purple">that edits itself</em>
              </>
            }
            subtitle="Remove pauses, smooth the cursor, and zoom on the action automatically. It understands software so you don't have to."
            primaryCta={{ label: "Download", href: "/download" }}
            secondaryCta={{ label: "Watch demo", href: "#" }}
            screenshotSrc="/glassmorphism.png"
            socialProof={{ count: "10,000+", label: "people shipping with bokeh" }}
          />

          <SocialProofSection />

          <FeatureShowcaseSection
            id="features"
            badge="Features"
            title={
              <>
                Premium screen recordings.<br />
                <em className="highlight-yellow">Minus the busywork.</em>
              </>
            }
            subtitle="We make the opinionated choices that usually take time. Framing, motion, and polish."
            features={showcaseFeatures}
          />

          <EditingFeaturesSection
            badge="Smart defaults"
            title={
              <>
                <span className="font-[family-name:var(--font-display)] italic font-medium">Less work.</span>
                <br />
                <span className="font-[family-name:var(--font-display)] italic font-medium">More polish.</span>
              </>
            }
            subtitle="We automate the tedious edits like pacing, zoom, and cleanup. Ship fast using our defaults, or adjust anything manually."
          />


          <SpeedComparisonSection />

          <FeatureGrid
            badge="Editing Suite"
            title={
              <>
                Small details.<br />
                <em className="highlight-pink">Big Wins.</em>
              </>
            }
            subtitle="Smart cleanup and typing enhancements that make every screen recording feel intentional."
            features={features}
            columns={3}
          />

          <TestimonialSection
            title="People ship premium screen recordings"
            subtitle="Product, support, and education professionals rely on bokeh for consistent demos, walkthroughs, and updates."
            testimonials={testimonials}
          />

          <PricingSection />

          <QASection
            id="resources"
            eyebrow="Q&A"
            title={
              <>
                Common questions<br />
                <em>shipping screen recordings.</em>
              </>
            }
            subtitle="Short, useful context on recording, editing, privacy, and requirements."
            items={faqs}
          />

          <CTASection
            title={<>Publish premium recordings <em>in minutes.</em></>}
            subtitle="Let bokeh handle the tedious work and ship a polished update fast."
            ctaLabel="Get started for free"
            ctaHref="/download"
            showArrow={true}
            arrowText="Ready to ship a clearer update?"
          />

          <Footer />
        </div>
      </main>
    </div>
  );
}
