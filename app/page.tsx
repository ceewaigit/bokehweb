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
    description: "Remove idle gaps automatically so recordings stay tight and watchable.",
  },
  {
    icon: Command,
    title: "Keyboard shortcuts",
    description: "Trigger core actions fast with built-in shortcuts.",
  },
  {
    icon: KeyRound,
    title: "Auto keystroke detection",
    description: "Detect keystrokes automatically to highlight what you type.",
  },
];

const showcaseFeatures = [
  {
    icon: Box,
    title: "3D effects",
    description: "Add depth and dimension to your recordings with cinematic 3D transformations.",
    image: "/features/3d.png",
    imagePlacement: "bottom" as const,
    backdrop: "dots" as const,
    span: "sm" as const,
    imageClassName: "w-[90%] max-h-[100px] object-contain object-bottom",
  },
  {
    icon: FileVideo,
    title: "Media import",
    description: "Import external video and audio to weave into your story.",
    image: "/features/import.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: MousePointer,
    title: "Smooth cursor",
    description: "Stabilized cursor motion makes tutorials feel calm and intentional.",
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
    title: "Advanced controls",
    description: "Move fast with smart defaults or dive deep to fine-tune every detail.",
    image: "/features/advanced.png",
    imagePlacement: "middle" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: Layers,
    title: "Beautiful backgrounds",
    description: "Swap in gradients, patterns, or solid colors for brand-ready recordings.",
    image: "/features/background.png",
    imagePlacement: "top" as const,
    textPosition: "left" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
];

const testimonials = [
  {
    content: "Bokeh turns rough screen takes into a clean walkthrough fast. It feels like a native part of our workflow.",
    author: { name: "Avery Chen", title: "Product Manager, Apple" },
  },
  {
    content: "I can record, trim, and share in minutes without touching a timeline. It looks polished every time.",
    author: { name: "Priya Kapoor", title: "Software Engineer, Google" },
  },
  {
    content: "The auto-zoom and cleanup features make onboarding videos feel intentional and easy to follow.",
    author: { name: "Marcus Lee", title: "Program Manager, Microsoft" },
  },
  {
    content: "Our support team ships studio‑quality recordings without the studio. The clarity is consistent.",
    author: { name: "Elena Torres", title: "Customer Support Lead, Amazon" },
  },
  {
    content: "Bokeh keeps tutorials crisp and focused. It’s the only recorder our team actually enjoys using.",
    author: { name: "Jonas Wright", title: "Product Manager, Meta" },
  },
  {
    content: "The cursor smoothing and export quality make every recording feel deliberate and professional.",
    author: { name: "Naomi Park", title: "Student, Apple Developer Academy" },
  },
];

const faqs = [
  {
    question: "Is my data private?",
    answer: "Absolutely. Your recordings never leave your machine. All processing happens locally, your videos stay yours, and you can opt out of basic analytics anytime. No cloud uploads, no third-party access, no compromises.",
  },
  {
    question: "Do you support commercial use?",
    answer: "100%. bokeh is built for professionals. Use it for client work, product demos, team onboarding, sales enablement, and internal updates. Your videos, your business, no restrictions.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, with no credit card required. Explore every feature, record as much as you want, and upgrade only when you're ready to export clean, watermark-free videos.",
  },
  {
    question: "What is a trade-in?",
    answer: "We believe you shouldn't pay for software forever. After 16 months on a monthly subscription, you've earned the right to trade in for a lifetime license at no extra cost. It's our way of rewarding loyal users, keep your subscription benefits forever, with no more payments.",
  },
  {
    question: "What export quality can I expect?",
    answer: "Pixel-perfect exports at your native Retina resolution. Every frame captures the full clarity of your Mac display, no downscaling, no compression artifacts. Your recordings look exactly as sharp as what you see on screen.",
  },
  {
    question: "How long does it take to learn bokeh?",
    answer: "Minutes, not hours. Record your first video, effects are applied automatically, and export. That's it. The smart defaults handle the polish so you can focus on your content. Power users can dive deeper whenever they're ready.",
  },
  {
    question: "Do I get free updates?",
    answer: "Pro subscribers get every update while subscribed. Lifetime license holders get all updates for the current major version, plus discounted upgrades when we release new major versions. Think IntelliJ or GoodNotes, fair pricing that respects your investment.",
  },
  {
    question: "What kind of support do you offer?",
    answer: "Real humans, fast responses. Pro and Lifetime users get priority email support with typical replies within hours, not days. We also maintain detailed docs and video tutorials for self-service help.",
  },
  {
    question: "Why bokeh instead of Loom or cloud recorders?",
    answer: "Ownership and privacy. Cloud tools host your videos on their servers, bokeh keeps everything local. You get professional-grade editing tools, no monthly upload limits, and your recordings aren't training someone else's AI. Plus, with our trade-in program, you can own it forever.",
  },
  {
    question: "What's coming next?",
    answer: "We build in the open. Our public roadmap shows exactly what's planned, what's in progress, and what's shipped. Have a feature request? You can vote and shape what we build next.",
  },
  {
    question: "How is bokeh different from typical screen recorders?",
    answer: "Most recorders just capture pixels. bokeh captures cursor data separately, so you can smooth movements, add zooms, and refine focus after recording. One take, unlimited polish, no re-records.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes, no questions asked. Cancel your monthly subscription whenever you want and keep using bokeh until your billing period ends. No cancellation fees, no hoops to jump through.",
  },
  {
    question: "What platforms does bokeh support?",
    answer: "macOS with Apple Silicon. We're laser-focused on making the best experience for Mac users first. Windows support is on our roadmap.",
  },
  {
    question: "What are the system requirements?",
    answer: "macOS Ventura 13.1 or later on Apple Silicon (M1 chip or newer). bokeh is optimized for Apple's latest hardware to deliver buttery-smooth recording and editing.",
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
                The modern screen recorder<br />
                <em className="highlight-purple">for product teams</em>
              </>
            }
            subtitle="Record and edit screen videos for demos, tutorials, and updates with fast cleanup, transcript edits, and polished exports."
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
                Studio-grade screen recordings.<br />
                <em className="highlight-yellow">Built for real teams.</em>
              </>
            }
            subtitle="A focused toolkit for cursor clarity, backgrounds, and fast export in every screen recording."
            features={showcaseFeatures}
          />

          <EditingFeaturesSection
            badge="Smart defaults"
            title={
              <>
                <span className="font-[family-name:var(--font-display)] italic font-medium">Less thinking.</span>
                <br />
                <span className="font-[family-name:var(--font-display)] italic font-medium">More shipping.</span>
              </>
            }
            subtitle="We handle the tedious parts with smart automation. Adjust everything when you want to—leave it alone when you don't."
          />

          <FeatureGrid
            badge="Editing Suite"
            title={
              <>
                Edit fast.<br />
                <em className="highlight-pink">Ship with confidence.</em>
              </>
            }
            subtitle="Tighten idle moments, speed up typing, and ship recordings quickly with smart presets and shortcuts."
            features={features}
            columns={3}
          />

          <SpeedComparisonSection />

          <TestimonialSection
            title="Teams ship clearer screen recordings"
            subtitle="Product, support, and education teams rely on bokeh for consistent walkthroughs, demos, and updates."
            testimonials={testimonials}
          />

          <PricingSection />

          <QASection
            id="resources"
            eyebrow="Q&A"
            title={
              <>
                Answers for teams<br />
                <em>recording fast.</em>
              </>
            }
            subtitle="Short, useful context on recording, editing, privacy, and requirements."
            items={faqs}
          />

          <CTASection
            title={<>try <em>bokeh</em> today.</>}
            subtitle="Start your free trial and publish clear, brand-ready screen recordings in minutes."
            ctaLabel="Get started for free"
            ctaHref="/#pricing"
            showArrow={true}
            arrowText="Ready to share a clearer picture?"
          />

          <Footer />
        </div>
      </main>
    </div>
  );
}
