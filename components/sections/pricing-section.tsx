"use client"

import React from "react"
import { Check, Info } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { SectionBackdrop } from "@/components/ui/section-backdrop"
import { pricingCopy, pricingPlans, enterprisePlan, pricingPhilosophy, PRICING, PRODUCT_READY } from "@/lib/pricing"
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
      <span className="text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
        {short}
      </span>
      <Info className="h-3 w-3 text-slate-300 transition-colors group-hover:text-slate-600" strokeWidth={2} />

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-sm"
          >
            <p className="text-[12px] leading-relaxed text-slate-600">
              {expanded}
            </p>
            {/* Tooltip arrow */}
            <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-slate-200/80 bg-white/90" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PricingSection: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<'individuals' | 'teams'>('individuals')
  const [billingCycle, setBillingCycle] = React.useState<'annual' | 'monthly'>('annual')
  const gpuStyle = { willChange: 'transform, opacity' as const, transform: 'translateZ(0)', backfaceVisibility: 'hidden' as const }

  // Calculate savings percentage dynamically
  const savingsPercent = Math.round((1 - PRICING.annual / PRICING.monthly) * 100)

  // Helper to get the right price for Pro plan based on billing toggle
  const getProPrice = () => {
    if (!PRODUCT_READY) return "Coming Soon"
    return billingCycle === 'annual' ? `$${PRICING.annual}` : `$${PRICING.monthly}`
  }
  const getProPriceSuffix = () => {
    if (!PRODUCT_READY) return ""
    return billingCycle === 'annual' ? "/ mo, billed annually" : "/ month"
  }

  return (
    <section id="pricing" className="relative w-full py-16 sm:py-24 md:py-32 overflow-hidden">
      <SectionBackdrop variant="dots" texture fade="all" className="opacity-50" />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 sm:px-6 text-center">
        {/* Section badge */}
        <motion.p
          className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400"
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
          className="mt-4 text-4xl font-semibold tracking-[-0.03em] leading-[1.06] text-slate-900 sm:text-5xl lg:text-6xl [text-wrap:balance] [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-orange-300"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {pricingCopy.title}{" "}
          <span className="whitespace-nowrap">
            <span className="relative inline-block text-slate-400">
              {pricingCopy.strike}
              <motion.svg
                className="pointer-events-none absolute left-[-2%] top-[60%] h-4 w-[104%] -translate-y-1/2"
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
          className="mt-4 sm:mt-5 max-w-xl text-pretty text-[15px] sm:text-[17px] leading-relaxed text-slate-500"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {pricingCopy.subtitle}
        </motion.p>

        {/* Billing Toggle - Neumorphic Style */}
        <motion.div
          className="mt-5 sm:mt-6 flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          {/* Billing cycle toggle */}
          <div className="relative flex items-center rounded-full border border-slate-200/70 bg-white/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_18px_rgba(15,23,42,0.06)]">
            <button
              onClick={() => setBillingCycle('annual')}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-[13px] font-semibold tracking-wide transition-all duration-200",
                billingCycle === 'annual'
                  ? "text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.08)] bg-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
              )}
            >
              Annual
              <span className="ml-1.5 text-[10px] font-semibold text-emerald-500">Save {savingsPercent}%</span>
            </button>
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-[13px] font-semibold tracking-wide transition-all duration-200",
                billingCycle === 'monthly'
                  ? "text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.08)] bg-white"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
              )}
            >
              Monthly
            </button>
          </div>
        </motion.div>

        {/* Content Container */}
        <div className="mt-6 sm:mt-8 w-full" style={{ minHeight: 480 }}>
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'individuals' ? (
              <motion.div
                key="individuals"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="grid w-full gap-4 sm:gap-6 lg:gap-8 sm:grid-cols-2 lg:grid-cols-3"
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
                      "relative flex flex-col rounded-[24px] sm:rounded-[32px] px-5 py-6 sm:px-8 sm:py-9 text-left overflow-hidden",
                      "transition-all duration-300 ease-out will-change-transform",
                      plan.highlight
                        ? "border-violet-200/50 bg-gradient-to-b from-violet-50/40 to-white shadow-[0_8px_30px_rgba(15,23,42,0.08),0_2px_12px_rgba(139,92,246,0.08)] hover:shadow-[0_10px_36px_rgba(15,23,42,0.12),0_6px_20px_rgba(139,92,246,0.12)]"
                        : "border-slate-200/70 bg-white/80 shadow-[0_2px_10px_rgba(15,23,42,0.06),0_12px_24px_rgba(15,23,42,0.05)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.08),0_16px_30px_rgba(15,23,42,0.08)]"
                    )}
                  >
                    {/* Coming Soon Overlay */}
                    {plan.comingSoon && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] sm:rounded-[32px] overflow-hidden">
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
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <h3 className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.02em] text-slate-800">
                        {plan.name}
                      </h3>
                      {plan.highlight && !plan.comingSoon && (
                        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600 shadow-[0_6px_16px_rgba(15,23,42,0.08)]">
                          Popular
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="min-h-[36px] sm:min-h-[40px] text-[13px] sm:text-[14px] leading-relaxed text-slate-500">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="mt-5 mb-5 sm:mt-8 sm:mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className={cn(
                          "font-[family-name:var(--font-geist-mono)] tabular-nums font-semibold tracking-[-0.04em] text-slate-900",
                          plan.comingSoon ? "text-[24px] sm:text-[28px]" : "text-[36px] sm:text-[42px]"
                        )}>
                          {/* Use dynamic pricing for Pro plan */}
                          {plan.name === "Pro" ? getProPrice() : plan.price}
                        </span>
                        {(plan.name === "Pro" ? getProPriceSuffix() : plan.priceSuffix) && (
                          <span className="text-[12px] sm:text-[14px] font-medium text-slate-400 ml-1">
                            {plan.name === "Pro" ? getProPriceSuffix() : plan.priceSuffix}
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
                    <div className="mb-5 sm:mb-8">
                      <NeumorphicButton
                        disabled={plan.comingSoon || plan.disabled}
                        className={cn(
                          "w-full py-3 sm:py-3.5 text-[13px] sm:text-[14px] font-semibold",
                          (plan.comingSoon || plan.disabled)
                            ? "opacity-60 cursor-not-allowed"
                            : "",
                          plan.highlight && !(plan.comingSoon || plan.disabled)
                            ? "text-violet-600 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:text-violet-700"
                            : "text-slate-700"
                        )}
                      >
                        {plan.comingSoon ? "Notify Me" : plan.cta}
                      </NeumorphicButton>
                    </div>

                    {/* Features list */}
                    <div className="flex-1 space-y-3 sm:space-y-4">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-2.5 sm:gap-3">
                          <span className="mt-0.5 flex h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/90 shadow-[0_4px_10px_rgba(15,23,42,0.08)]">
                            <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-500" strokeWidth={3} />
                          </span>
                          <span className="text-[13px] sm:text-[14px] leading-snug text-slate-600">
                            {feature}
                          </span>
                        </div>
                      ))}
                      {/* Limitations list - styled differently */}
                      {plan.limitations?.map((limitation) => (
                        <div key={limitation} className="flex items-start gap-2.5 sm:gap-3">
                          <span className="mt-0.5 flex h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100/60 shadow-[0_2px_6px_rgba(15,23,42,0.06)]">
                            <Info className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400" strokeWidth={2.5} />
                          </span>
                          <span className="text-[13px] sm:text-[14px] leading-snug text-slate-400 italic">
                            {limitation}
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
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
          className="mt-10 flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          style={gpuStyle}
        >
          <p className="text-[14px] font-semibold text-slate-700">
            {pricingPhilosophy.tagline}
          </p>
          <p className="text-[13px] text-slate-500 max-w-md">
            {pricingPhilosophy.summary}
          </p>

          {/* Teams link - subtle toggle below */}
          {activeTab === 'individuals' && (
            <button
              onClick={() => setActiveTab('teams')}
              className="mt-2 text-[12px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5"
            >
              Looking for team pricing?
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {activeTab === 'teams' && (
            <button
              onClick={() => setActiveTab('individuals')}
              className="mt-2 text-[12px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1.5"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to individual pricing
            </button>
          )}
        </motion.div>
      </div>
    </section>
  )
}

export default PricingSection
