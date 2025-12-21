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
    icon: Type,
    title: "Typing speed-up",
    description: "Speed up long typing stretches to keep walkthroughs moving.",
  },
  {
    icon: Command,
    title: "Keyboard shortcuts",
    description: "Trigger core actions fast with built-in shortcuts.",
  },
  {
    icon: Crop,
    title: "Aspect ratio presets",
    description: "Switch to ready-made aspect ratios for common layouts.",
  },
  {
    icon: KeyRound,
    title: "Auto keystroke detection",
    description: "Detect keystrokes automatically to highlight what you type.",
  },
];

const showcaseFeatures = [
  {
    icon: Wand2,
    title: "Auto zoom",
    description: "Auto zoom tracks your cursor to spotlight every click and demo.",
    video: "/features/zoom-720.mp4",
    imagePlacement: "middle" as const,
    backdrop: "dots" as const,
    span: "md" as const,
  },
  {
    icon: Download,
    title: "HD zoom",
    description: "Zoom in without losing clarity, your video stays crisp and high definition.",
    image: "/features/HDZoom.png",
    imagePlacement: "middle" as const,
    backdrop: "grid" as const,
    span: "sm" as const,
  },
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
    icon: MousePointer,
    title: "Smooth cursor",
    description: "Stabilized cursor motion makes tutorials feel calm and intentional.",
    image: "/features/arrow.png",
    imagePlacement: "middle" as const,
    backdrop: "grid" as const,
    span: "md" as const,
    isGraphic: true,
    imageClassName: "w-[70%] max-h-[180px] object-contain",
    interactive: "cursor-follow" as const,
  },
  {
    icon: FileVideo,
    title: "Media import",
    description: "Import external video and audio to weave into your story.",
    image: "/features/import.png",
    imagePlacement: "bottom" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
  {
    icon: Layers,
    title: "Beautiful backgrounds",
    description: "Swap in gradients, patterns, or solid colors for brand-ready recordings.",
    image: "/features/background.png",
    imagePlacement: "top" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
  {
    icon: Palette,
    title: "Advanced controls",
    description: "Move fast with smart defaults or dive deep to fine-tune every detail.",
    image: "/features/advanced.png",
    imagePlacement: "middle" as const,
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
    answer: "100%. Recordings are stored locally. Processing stays on your machine, and you can opt out of basic analytics at any time.",
  },
  {
    question: "What editing can I do without a timeline?",
    answer: "Transcript edits, silence removal, filler cleanup, precision trims, and cursor polish. Use the timeline when you want deeper control.",
  },
  {
    question: "Do you support commercial use?",
    answer: "Yes. bokeh is built for client work, product demos, onboarding, and internal updates.",
  },
  {
    question: "Is there a free trial?",
    answer: "You can try bokeh for free. Upgrade only when you are ready to export and share.",
  },
  {
    question: "What’s coming next?",
    answer: "We keep a public roadmap so you can see what is planned and what is in progress.",
  },
  {
    question: "How is bokeh different from typical screen recorders?",
    answer: "Bokeh captures clean video and uses precise cursor data to polish movement and focus after capture, so you can refine without re‑recording.",
  },
  {
    question: "What platforms does bokeh support?",
    answer: "Currently, bokeh is only available for macOS Apple Silicon only.",
  },
  {
    question: "What are the system requirements?",
    answer: "macOS Ventura 13.1 or later is recommended for the best performance.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
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
            primaryCta={{ label: "Get started", href: "#" }}
            secondaryCta={{ label: "Watch demo", href: "#" }}
            screenshotSrc="/hero.png"
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
            ctaHref="#"
            showArrow={true}
            arrowText="Ready to share clearer updates?"
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
