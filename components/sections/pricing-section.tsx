"use client"

import React from "react"
import { Check, Info } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { SectionBackdrop } from "@/components/ui/section-backdrop"
import { pricingCopy, pricingPlans, enterprisePlan, pricingPhilosophy } from "@/lib/pricing"
import { NeumorphicButton } from "@/components/ui/neumorphic-button"

// Tooltip component for philosophy callouts
const CalloutTooltip = ({ short, expanded }: { short: string; expanded: string }) => {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <div
      className="relative inline-flex items-center gap-1.5 cursor-help group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">
        {short}
      </span>
      <Info className="h-3 w-3 text-gray-300 transition-colors group-hover:text-violet-400" strokeWidth={2} />

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-gray-200/80 bg-slate-100 p-3.5 shadow-xl backdrop-blur-sm"
          >
            <p className="text-[12.5px] leading-relaxed text-gray-600">
              {expanded}
            </p>
            {/* Tooltip arrow */}
            <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-gray-200/80 bg-slate-100" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PricingSection: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<'individuals' | 'teams'>('individuals')
  const gpuStyle = { willChange: 'transform, opacity' as const, transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const }

  return (
    <section id="pricing" className="relative w-full py-24 md:py-32 overflow-hidden">
      <SectionBackdrop variant="dots" texture fade="all" className="opacity-50" />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        {/* Section badge */}
        <motion.p
          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-400"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {pricingCopy.eyebrow}
        </motion.p>

        {/* Main heading */}
        <motion.h2
          className="mt-4 text-4xl font-semibold tracking-[-0.025em] leading-[1.1] text-gray-900 sm:text-5xl lg:text-6xl [text-wrap:balance] [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-orange-300"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {pricingCopy.title}{" "}
          <span className="whitespace-nowrap">
            <span className="relative inline-block text-gray-400">
              {pricingCopy.strike}
              <motion.svg
                className="pointer-events-none absolute left-[-2%] top-[52%] h-4 w-[104%] -translate-y-1/2"
                viewBox="0 0 100 12"
                preserveAspectRatio="none"
                fill="none"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.2, delay: 0.15 }}
              >
                <motion.path
                  d="M0 6.6 Q 25 3.6, 50 6.1 Q 75 8.6, 100 4.8"
                  stroke="#9ca3af"
                  strokeWidth="4.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{ duration: 0.45, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                />
              </motion.svg>
            </span>{" "}
            {pricingCopy.titleAfter}
          </span>{" "}
          <br />
          <motion.em
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 0.3, delay: 0.05, ease: [0.2, 0.9, 0.2, 1] }}
          >
            {pricingCopy.titleEmphasis}
          </motion.em>
          .
        </motion.h2>

        {/* Subtitle - improved typography */}
        <motion.p
          className="mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-gray-500 font-light"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {pricingCopy.subtitle}
        </motion.p>

        {/* Toggle - Neumorphic Style */}
        <motion.div
          className="mt-6 flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          <div className="relative flex items-center rounded-full bg-slate-100 p-1 shadow-[inset_-2px_-2px_5px_rgba(255,255,255,0.7),inset_2px_2px_5px_rgba(0,0,0,0.1)]">
            <button
              onClick={() => setActiveTab('individuals')}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-[13px] font-medium tracking-wide transition-all duration-200",
                activeTab === 'individuals'
                  ? "text-gray-900 shadow-[-2px_-2px_5px_rgba(255,255,255,0.8),2px_2px_5px_rgba(0,0,0,0.1)] bg-slate-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-slate-200/50"
              )}
            >
              Individuals
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-[13px] font-medium tracking-wide transition-all duration-200",
                activeTab === 'teams'
                  ? "text-gray-900 shadow-[-2px_-2px_5px_rgba(255,255,255,0.8),2px_2px_5px_rgba(0,0,0,0.1)] bg-slate-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-slate-200/50"
              )}
            >
              Teams
            </button>
          </div>
        </motion.div>

        {/* Content Container */}
        <div className="mt-8 w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'individuals' ? (
              <motion.div
                key="individuals"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="grid w-full gap-8 sm:grid-cols-2 lg:grid-cols-3"
              >
                {pricingPlans.map((plan, index) => (
                  <GlassCard
                    key={plan.name}
                    variant="subtle"
                    hover={false}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={plan.comingSoon ? undefined : { y: -2 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: index * 0.08, ease: [0.21, 0.47, 0.32, 0.98] }}
                    className={cn(
                      "relative flex flex-col rounded-[32px] px-8 py-9 text-left overflow-hidden",
                      "transition-all duration-300 ease-out will-change-transform",
                      plan.highlight
                        ? "border-violet-200/50 bg-gradient-to-b from-violet-50/40 to-white shadow-[0_2px_16px_rgba(139,92,246,0.06),0_8px_32px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_24px_rgba(139,92,246,0.1),0_12px_40px_rgba(0,0,0,0.06)]"
                        : "border-gray-200/70 bg-white/80 shadow-[0_1px_4px_rgba(0,0,0,0.02),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.06)]"
                    )}
                  >
                    {/* Coming Soon Overlay */}
                    {plan.comingSoon && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[32px] overflow-hidden">
                        <div className="absolute inset-0 backdrop-blur-[2px] bg-slate-100/50" />
                        <motion.span
                          className="relative z-20 rounded-full bg-slate-100 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 shadow-[-4px_-4px_8px_rgba(255,255,255,0.9),4px_4px_8px_rgba(0,0,0,0.1)]"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        >
                          Coming Soon
                        </motion.span>
                      </div>
                    )}

                    {/* Plan header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[17px] font-bold tracking-[-0.01em] text-gray-800">
                        {plan.name}
                      </h3>
                      {plan.highlight && !plan.comingSoon && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-violet-600 shadow-[-2px_-2px_4px_rgba(255,255,255,0.9),2px_2px_4px_rgba(0,0,0,0.1),inset_-1px_-1px_2px_rgba(255,255,255,0.5),inset_1px_1px_2px_rgba(0,0,0,0.05)]">
                          Popular
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="min-h-[40px] text-[14px] leading-relaxed text-gray-500">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="mt-8 mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className={cn(
                          "font-bold tracking-[-0.03em] text-gray-900",
                          plan.comingSoon ? "text-[28px]" : "text-[42px]"
                        )}>
                          {plan.price}
                        </span>
                        {plan.priceSuffix && (
                          <span className="text-[14px] font-medium text-gray-400 ml-1">
                            {plan.priceSuffix}
                          </span>
                        )}
                      </div>

                      {/* Integrated callout tooltip - the philosophy */}
                      {plan.callout && (
                        <div className="mt-3">
                          <CalloutTooltip short={plan.callout.short} expanded={plan.callout.expanded} />
                        </div>
                      )}
                    </div>

                    {/* CTA button */}
                    <div className="mb-8">
                      <NeumorphicButton
                        disabled={plan.comingSoon || plan.disabled}
                        className={cn(
                          "w-full py-3.5 text-[14px] font-semibold",
                          (plan.comingSoon || plan.disabled)
                            ? "opacity-60 cursor-not-allowed"
                            : "",
                          plan.highlight && !(plan.comingSoon || plan.disabled)
                            ? "text-violet-600 shadow-[-5px_-5px_10px_rgba(255,255,255,0.9),5px_5px_10px_rgba(0,0,0,0.1)] hover:text-violet-700"
                            : "text-gray-700"
                        )}
                      >
                        {plan.comingSoon ? "Notify Me" : plan.cta}
                      </NeumorphicButton>
                    </div>

                    {/* Features list */}
                    <div className="flex-1 space-y-4">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 shadow-[-2px_-2px_4px_rgba(255,255,255,0.9),2px_2px_4px_rgba(0,0,0,0.1)]">
                            <Check className="h-3 w-3 text-emerald-500" strokeWidth={3} />
                          </span>
                          <span className="text-[14px] leading-snug text-gray-600">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="teams"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="w-full flex justify-center"
              >
                <GlassCard
                  variant="subtle"
                  hover={false}
                  className="relative flex flex-col md:flex-row items-center justify-between gap-8 rounded-2xl border border-gray-200/70 bg-white/60 px-8 py-8 md:px-10 md:py-8 shadow-sm overflow-hidden max-w-3xl"
                >
                  {/* Background Pattern */}
                  <div className="absolute inset-0 -z-10 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />

                  <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2 max-w-md">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-500">
                      {enterprisePlan.eyebrow}
                    </span>
                    <h3 className="text-xl font-semibold tracking-[-0.02em] text-gray-900">
                      {enterprisePlan.name}
                    </h3>
                    <p className="text-[14px] leading-relaxed text-gray-500">
                      {enterprisePlan.description}
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center md:justify-start gap-x-5 gap-y-1.5">
                      {enterprisePlan.features.slice(0, 4).map((feature) => (
                        <div key={feature} className="flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5 text-violet-500" strokeWidth={2.5} />
                          <span className="text-[12px] font-medium text-gray-600">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <NeumorphicButton
                      disabled={enterprisePlan.comingSoon}
                      className={cn(
                        "rounded-xl px-5 py-2.5 text-[12px] font-semibold tracking-wide transition-all duration-200",
                        enterprisePlan.comingSoon
                          ? "cursor-not-allowed bg-gray-100 text-gray-400"
                          : "bg-gray-900 text-white shadow-sm hover:bg-gray-800"
                      )}
                    >
                      {enterprisePlan.comingSoon ? "Coming Soon" : enterprisePlan.cta}
                    </NeumorphicButton>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom philosophy tagline */}
        <motion.div
          className="mt-10 flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          <p className="text-[14px] font-semibold text-gray-700">
            {pricingPhilosophy.tagline}
          </p>
          <p className="text-[13px] text-gray-500 max-w-md">
            {pricingPhilosophy.summary}
          </p>
        </motion.div>
      </div>
    </section>
  )
}

export default PricingSection
