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
  Scissors,
  Sparkles,
  Type,
  Clock,
  Wand2,
  Layers,
  MousePointer,
  Palette,
  Video,
  Zap,
  Download
} from "lucide-react";
import PricingSection from "@/components/sections/pricing-section";

const features = [
  {
    icon: Scissors,
    title: "Silence cleanup",
    description: "Remove dead air automatically so every recording stays tight and watchable",
    highlight: "by default.",
  },
  {
    icon: Sparkles,
    title: "Filler word removal",
    description: "Clean up ums and ahs for a polished delivery without manual edits",
    highlight: "in one pass.",
  },
  {
    icon: Type,
    title: "Edit by transcript",
    description: "Cut, reorder, and refine video using the transcript",
    highlight: "like a doc.",
  },
  {
    icon: Clock,
    title: "Smart trim",
    description: "Clean starts and endings so recordings open strong and close clean",
    highlight: "automatically.",
  },
];

const showcaseFeatures = [
  {
    icon: Wand2,
    title: "Auto zoom",
    description: "Auto zoom tracks your cursor to spotlight every click and demo.",
    image: "/screenshot1.png",
    imagePlacement: "middle" as const,
    backdrop: "dots" as const,
    span: "md" as const,
  },
  {
    icon: Layers,
    title: "Beautiful backgrounds",
    description: "Swap in gradients, patterns, or solid colors for brand-ready recordings.",
    image: "/screenshot2.png",
    imagePlacement: "top" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
  {
    icon: MousePointer,
    title: "Smooth cursor",
    description: "Stabilized cursor motion makes tutorials feel calm and intentional.",
    image: "/screenshot1.png",
    imagePlacement: "bottom" as const,
    backdrop: "grid" as const,
    span: "sm" as const,
  },
  {
    icon: Video,
    title: "Webcam overlay",
    description: "Add a picture-in-picture camera bubble for a more human walkthrough.",
    image: "/screenshot2.png",
    imagePlacement: "middle" as const,
    backdrop: "dots" as const,
    span: "sm" as const,
  },
  {
    icon: Zap,
    title: "Instant export",
    description: "Render and share in seconds with optimized quality.",
    image: "/screenshot1.png",
    imagePlacement: "bottom" as const,
    backdrop: "gradient" as const,
    span: "sm" as const,
  },
  {
    icon: Download,
    title: "Multiple formats",
    description: "Export to MP4, GIF, or web-ready formats for any channel.",
    image: "/screenshot2.png",
    imagePlacement: "top" as const,
    backdrop: "dots" as const,
    span: "md" as const,
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
    answer: "Recordings are stored locally. Processing stays on your machine, and you can opt out of basic analytics at any time.",
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
        <div className="absolute inset-0 pointer-events-none -z-10 page-backdrop" />

        {/* Sections with transparent backgrounds - they blend into the global gradient */}
        <div className="relative">
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
            screenshotSrc="/screenshot1.png"
            socialProof={{ count: "10,000+", label: "teams already recording with bokeh" }}
          />

          <SocialProofSection />

          <FeatureShowcaseSection
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
            subtitle="Remove silences, clean filler words, and edit by transcript to deliver crisp, on-brand screen recordings."
            features={features}
            columns={4}
          />

          <TestimonialSection
            title="Teams ship clearer screen recordings"
            subtitle="Product, support, and education teams rely on bokeh for consistent walkthroughs, demos, and updates."
            testimonials={testimonials}
          />

          <QASection
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

          <PricingSection />

          <CTASection
            title={<>Try <em>bokeh.</em></>}
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
