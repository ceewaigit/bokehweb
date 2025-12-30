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
import { RecordDockSection } from "@/components/sections/record-dock-section";
import { MacOSDockSection } from "@/components/sections/macos-dock-section";
import { MailingListSection } from "@/components/sections/mailing-list-section";
import { Highlighter } from "@/components/ui/highlighter";
import { GlassmorphismItem } from "@/components/features/glassmorphism-item";

import {
  Clock,
  Command,
  Crop,
  Wand2,
  Layers,
  MousePointer,
  Palette,
  Box,
  FileVideo,
  Download,
  WifiOff,
  Sparkles
} from "lucide-react";
import PricingSection from "@/components/sections/pricing-section";

const features = [
  {
    icon: Clock,
    title: "Idle cleanup",
    description: "Dead air, gone. We trim the pauses so you don't have to.",
  },
  {
    icon: Command,
    title: "Keyboard shortcuts",
    description: "Your hands stay on the keyboard. We designed it that way.",
  },
  {
    icon: Download,
    title: "Export and share",
    description: "Your file, your call. Export and share wherever you want.",
  },
  {
    icon: Wand2,
    title: "Smart defaults",
    description: "We pick the obvious settings. You override when it matters.",
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
    description: "Drag, drop, done. Timeline edits when you need them, auto-polish when you don't.",
    image: "/features/import.png",
    imagePlacement: "middle" as const,
    textPosition: "right" as const,
    objectPosition: "left" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
  },
  {
    icon: MousePointer,
    title: "Stabilized cursor",
    description: "Liquid motion. A cursor that glides, never jitters.",
    image: "/features/arrow.png",
    imagePlacement: "middle" as const,
    textPosition: "center" as const,
    backdrop: "grid" as const,
    span: "sm" as const,
    rowSpan: "md" as const,
    isGraphic: true,
    imageClassName: "w-[90%] max-h-[500px] object-contain",
    interactive: "cursor-follow" as const,
  },
  {
    icon: Layers,
    title: "Brand-ready backgrounds",
    description: "On-brand, always. Backgrounds that fit your guidelines instantly.",
    video: "/features/wallpaper.webm",
    imagePlacement: "top" as const,
    textPosition: "left" as const,
    objectPosition: "right" as const,
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
    icon: Sparkles,
    title: "Glassmorphism",
    description: "Solid, glassmorphic and clear themes.",
    component: <GlassmorphismItem />,
    imagePlacement: "bottom" as const,
    backdrop: "gradient" as const,
    span: "md" as const,
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
    content: "bokeh takes messy recordings and turns them into polished walkthroughs in minutes.",
    author: { name: "Avery Chen", title: "Product Manager, Apple" },
  },
  {
    content: "Timeline when I want it, auto-polish when I don't. I record, let bokeh polish, and ship.",
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
  // {
  //   question: "How does subscription credit work?",
  //   answer: "Your monthly payments accumulate toward a lifetime license. Once you've paid $149 through your subscription, the current major version is yours forever, no extra payment needed.",
  // },
  {
    question: "What's included in a lifetime license?",
    answer: "A lifetime license covers all updates within a major version (e.g., v1.0 to v1.x). When we release a new major version (v2.0), that's a separate purchase, but your subscription payments on the new version count toward it too.",
  },
  // {
  //   question: "What's the difference between monthly and annual billing?",
  //   answer: "Monthly is $13/mo, cancel anytime. Annual is $8/mo ($96 billed yearly), about 38% savings. Both count toward your lifetime license.",
  // },
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
        <div className="hidden sm:block absolute inset-0 pointer-events-none z-0">
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
            brandMarkSrc="/brand/bokeh_icon.svg"
            brandMarkAlt="bokeh logo"
            title={
              // <>
              //   The recorder that<br />
              //   <Highlighter action="highlight" style="clean" color="#a78bfa"><em className="not-italic text-inherit">respects your craft.</em></Highlighter>
              // </>
              <>
                better<br /> product demos<br />
                <Highlighter action="highlight" style="clean" color="#a78bfa"><em className="not-italic text-inherit">15x faster.</em></Highlighter>
              </>
            }
            subtitle="Your work deserves better than shaky cursors and dead air. bokeh automagically applies the cinematic polish and intentionality that most tools miss."
            primaryCta={{ label: "Download", href: "/download" }}
            videoSrc="/hero/hero_export.webm"
            scrollVideoSrc="/hero/recording_workspace.webm"
            socialProof={{ count: "10,000+", label: "people shipping with bokeh" }}
          />

          {/* <SocialProofSection /> */}

          <FeatureShowcaseSection
            id="features"
            className="pt-0 sm:pt-0 lg:pt-0"
            badge="Features"
            title={
              <>
                Cinematic motion.<br />
                <Highlighter action="highlight" style="clean" color="#fde047"><em className="not-italic text-inherit">Zero effort.</em></Highlighter>
              </>
            }
            subtitle="We automated the techniques top creators use. Smooth zooms, liquid cursors, and perfect pacing."
            features={showcaseFeatures}
          />

          <EditingFeaturesSection
            badge="Smart defaults"
            title={
              <>
                <span className="font-[family-name:var(--font-display)] italic font-medium">
                  <Highlighter action="underline" color="#cbd5e1" style="clean" delay={200}>Less work.</Highlighter>
                </span>
                <br />
                <span className="font-[family-name:var(--font-display)] italic font-medium">More polish.</span>
              </>
            }
            subtitle="We automate the tedious edits like pacing, zoom, and cleanup. Ship fast using our defaults, or adjust anything manually."
          />

          <SpeedComparisonSection />

          <MacOSDockSection />

          <RecordDockSection />

          <FeatureGrid
            badge="Intentional choices"
            title={
              <>
                Intentional choices.<br />
                <Highlighter action="highlight" style="clean" color="#f472b6"><em className="not-italic text-inherit">Everywhere.</em></Highlighter>
              </>
            }
            subtitle="A few highlights from dozens of small decisions that make bokeh feel different."
            features={features}
            columns={4}
          />

          <TestimonialSection
            title={
              <>
                Trusted by teams who care about <Highlighter action="circle" style="clean" color="#8b5cf6" className="text-inherit"><em className="text-primary not-italic">craft.</em></Highlighter>
              </>
            }
            subtitle="From changing the way they demo, to shipping faster updates. See why detail-oriented teams switched to bokeh."
            testimonials={testimonials}
          />

          <PricingSection />

          <QASection
            id="resources"
            eyebrow="Q&A"
            title={
              <>
                Everything you need to know about <em>bokeh.</em>
              </>
            }
            subtitle="No hidden clauses. No gotchas. Just bokeh."
            items={faqs}
          />

          <MailingListSection />

          <CTASection
            title={<>Stop fighting with your <Highlighter action="circle" style="clean" className="text-inherit"><em className="not-italic">video editor.</em></Highlighter></>}
            subtitle="Start shipping clearer, sharper, and more professional updates today."
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
