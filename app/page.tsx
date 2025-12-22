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
  Download
} from "lucide-react";
import PricingSection from "@/components/sections/pricing-section";

const features = [
  {
    icon: Clock,
    title: "Idle cleanup",
    description: "Trim dead time automatically so recordings stay tight.",
  },
  {
    icon: Command,
    title: "Keyboard shortcuts",
    description: "Move faster with built-in shortcuts for core edits.",
  },
  {
    icon: KeyRound,
    title: "Auto keystroke detection",
    description: "Surface what you type automatically without setup.",
  },
];

const showcaseFeatures = [
  {
    icon: Box,
    title: "Cinematic depth",
    description: "Give product clips subtle dimension without keyframes.",
    image: "/features/3d.png",
    imagePlacement: "bottom" as const,
    backdrop: "dots" as const,
    span: "sm" as const,
    imageClassName: "w-[90%] max-h-[100px] object-contain object-bottom",
  },
  {
    icon: FileVideo,
    title: "Bring your media in",
    description: "Layer clips and audio without leaving the recorder.",
    image: "/features/import.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: MousePointer,
    title: "Stabilized cursor",
    description: "A calm pointer keeps focus exactly where it should be.",
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
    icon: Palette,
    title: "Deep control when you want it",
    description: "Opinionated defaults, with fine-tuning on demand.",
    image: "/features/advanced.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: Layers,
    title: "Brand-ready backgrounds",
    description: "Swap colors, gradients, or texture in one click.",
    image: "/features/background.png",
    imagePlacement: "top" as const,
    textPosition: "left" as const,
    backdrop: "gradient" as const,
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
    question: "Is my data private?",
    answer: "Yes. Recording and processing happen locally on your Mac. No cloud uploads by default, no third-party access.",
  },
  {
    question: "Do you support commercial use?",
    answer: "Yes. Use it for client work, product demos, onboarding, sales enablement, and internal updates.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, no credit card required. Full access during the trial, then upgrade for clean, watermark-free exports.",
  },
  {
    question: "What is a trade-in?",
    answer: "After 16 months on Pro, trade in for a lifetime license at no extra cost. Keep the software and stop paying.",
  },
  {
    question: "What export quality can I expect?",
    answer: "Native Retina-resolution exports with crisp zooms and clean details. What you see on screen is what you ship.",
  },
  {
    question: "How long does it take to learn bokeh?",
    answer: "Minutes. Record, let bokeh apply the polish automatically, and export. Fine-tune anytime.",
  },
  {
    question: "Do I get free updates?",
    answer: "Pro includes updates while subscribed. Lifetime includes updates for the current major version, plus discounted upgrades.",
  },
  {
    question: "What kind of support do you offer?",
    answer: "Priority email support for Pro and Lifetime, plus clear docs and tutorials.",
  },
  {
    question: "Why bokeh instead of Loom or cloud recorders?",
    answer: "Local-first ownership and better polish. No upload limits, no cloud lock-in, and your recordings stay on your machine.",
  },
  {
    question: "What's coming next?",
    answer: "We build in the open with a public roadmap. You can vote on what we ship next.",
  },
  {
    question: "How is bokeh different from typical screen recorders?",
    answer: "Most recorders just capture pixels. bokeh captures cursor, audio, and keystroke data too, so you can smooth motion, add zooms, and refine focus after recording.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Cancel anytime and keep access through your billing period.",
  },
  {
    question: "What platforms does bokeh support?",
    answer: "macOS on Apple Silicon. Windows is on the roadmap.",
  },
  {
    question: "What are the system requirements?",
    answer: "macOS Ventura 13.1 or later on Apple Silicon (M1 or newer).",
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
            subtitle="bokeh. is a macOS screen recording app that removes dead time, smooths cursor motion, and auto-zooms so every demo looks expensive in minutes."
            primaryCta={{ label: "Download", href: "#" }}
            secondaryCta={{ label: "Watch demo", href: "#" }}
            screenshotSrc="/glassmorphism.png"
            socialProof={{ count: "10,000+", label: "teams already recording with bokeh" }}
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
            subtitle="We make the opinionated choices that usually take time: framing, motion, and polish."
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
            subtitle="We automate the tedious edits - pacing, zoom, and cleanup - so you can ship fast. Adjust anything, or just export."
          />

          <FeatureGrid
            badge="Editing Suite"
            title={
              <>
                Small details.<br />
                <em className="highlight-pink">Big polish.</em>
              </>
            }
            subtitle="Smart cleanup and typing enhancements that make every screen recording feel intentional."
            features={features}
            columns={3}
          />

          <SpeedComparisonSection />

          <TestimonialSection
            title="Teams ship premium screen recordings"
            subtitle="Product, support, and education teams rely on bokeh for consistent demos, walkthroughs, and updates."
            testimonials={testimonials}
          />

          <PricingSection />

          <QASection
            id="resources"
            eyebrow="Q&A"
            title={
              <>
                Answers for teams<br />
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
            ctaHref="/#pricing"
            showArrow={true}
            arrowText="Ready to ship a clearer update?"
          />

          <Footer />
        </div>
      </main>
    </div>
  );
}
