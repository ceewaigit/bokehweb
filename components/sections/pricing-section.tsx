"use client"

import React from "react"
import { Check } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { SectionBackdrop } from "@/components/ui/section-backdrop"
import { pricingCopy, pricingPlans } from "@/lib/pricing"

const PricingSection: React.FC = () => {
  const fadeInStyle = { opacity: 0 }

  return (
    <section id="pricing" className="relative w-full py-24 md:py-32 overflow-hidden">
      <SectionBackdrop variant="dots" texture fade="all" className="opacity-50" />
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        {/* Section badge */}
        <motion.p
          className="text-[11px] font-medium uppercase tracking-[0.2em] text-gray-400"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          style={fadeInStyle}
        >
          {pricingCopy.eyebrow}
        </motion.p>

        {/* Main heading - refined typography */}
        <motion.h2
          className="mt-4 text-5xl font-semibold tracking-tight leading-[1.05] text-gray-900 sm:text-6xl lg:text-7xl font-sans [text-wrap:balance] [&_em]:font-[family-name:var(--font-display)] [&_em]:italic [&_em]:font-medium [&_em]:text-orange-300"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          style={fadeInStyle}
        >
          {pricingCopy.title} <em className="">{pricingCopy.titleEmphasis}</em>.
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          className="mt-5 max-w-2xl text-pretty text-[18px] leading-relaxed text-gray-500"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
          style={fadeInStyle}
        >
          {pricingCopy.subtitle}
        </motion.p>

        {/* Cards grid */}
        <div className="mt-14 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <GlassCard
              key={plan.name}
              variant="subtle"
              hover={false}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: [0.21, 0.47, 0.32, 0.98] }}
              className={cn(
                "relative flex min-h-[22rem] md:min-h-[26rem] flex-col rounded-3xl border px-8 py-9 text-left overflow-hidden",
                "transition-all duration-300 ease-out",
                plan.comingSoon ? "" : "hover:-translate-y-1",
                plan.highlight
                  ? "border-violet-200/60 bg-gradient-to-b from-violet-50/50 to-white shadow-[0_4px_24px_rgba(139,92,246,0.08),0_12px_40px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_rgba(139,92,246,0.12),0_16px_48px_rgba(0,0,0,0.08)]"
                  : "border-gray-200/80 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05),0_16px_40px_rgba(0,0,0,0.08)]"
              )}
            >
              {/* Coming Soon Mosaic Overlay */}
              {plan.comingSoon && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl overflow-hidden">
                  {/* Animated mosaic background */}
                  <div className="absolute inset-0 backdrop-blur-[2px]">
                    {/* Mosaic grid pattern */}
                    <div className="absolute inset-0 grid grid-cols-6 grid-rows-8 gap-[1px]">
                      {Array.from({ length: 48 }).map((_, i) => (
                        <motion.div
                          key={i}
                          className={cn(
                            "rounded-sm",
                            i % 5 === 0 ? "bg-violet-200/40" :
                              i % 4 === 0 ? "bg-indigo-100/50" :
                                i % 3 === 0 ? "bg-gray-100/60" :
                                  i % 2 === 0 ? "bg-violet-100/30" :
                                    "bg-white/70"
                          )}
                          initial={{ opacity: 0.3 }}
                          animate={{
                            opacity: [0.3, 0.7, 0.3],
                            scale: [1, 1.02, 1],
                          }}
                          transition={{
                            duration: 3 + (i % 4),
                            delay: (i % 8) * 0.2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                    {/* Glassmorphic overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-gray-50/40 to-violet-50/50" />
                  </div>
                  {/* Coming Soon badge */}
                  <motion.div
                    className="relative z-20 flex flex-col items-center gap-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    <span className="rounded-full bg-gray-900/90 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-lg backdrop-blur-sm">
                      Coming Soon
                    </span>
                  </motion.div>
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-gray-900">
                  {plan.name}
                </h3>
                {plan.highlight && !plan.comingSoon && (
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
                    Popular
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="mt-2.5 min-h-[48px] text-[15px] leading-relaxed text-gray-500">
                {plan.description}
              </p>

              {/* Price */}
              <div className="mt-8 min-h-[92px]">
                <div className="flex items-baseline gap-1.5">
                  <span className={cn(
                    "font-semibold tracking-[-0.03em] text-gray-900",
                    plan.comingSoon ? "text-[28px]" : "text-[42px]"
                  )}>
                    {plan.price}
                  </span>
                  {plan.priceSuffix && (
                    <span className="text-[14px] font-medium text-gray-400">
                      {plan.priceSuffix}
                    </span>
                  )}
                </div>
                {plan.footnote && (
                  <p className="mt-2.5 text-[12px] leading-relaxed text-gray-400">
                    {plan.footnote}
                  </p>
                )}
              </div>

              {/* Features list */}
              <div className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Check className="h-3 w-3 text-gray-600" strokeWidth={2.5} />
                    </span>
                    <span className="text-[14px] leading-snug text-gray-600">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <div className="mt-auto pt-10">
                <button
                  disabled={plan.comingSoon || plan.disabled}
                  className={cn(
                    "w-full rounded-full px-5 py-3.5 text-[13px] font-semibold tracking-[-0.01em] transition-all duration-200",
                    (plan.comingSoon || plan.disabled)
                      ? "cursor-not-allowed bg-gray-100 text-gray-400"
                      : "cursor-pointer",
                    !(plan.comingSoon || plan.disabled) && plan.highlight
                      ? "bg-gray-900 text-white shadow-sm hover:bg-gray-800 hover:glow-purple"
                      : !(plan.comingSoon || plan.disabled)
                        ? "bg-white text-gray-900 ring-1 ring-gray-200 hover:ring-gray-300 hover:bg-gray-50"
                        : ""
                  )}
                >
                  {plan.comingSoon ? "Notify Me" : plan.cta}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Bottom note */}
        <motion.p
          className="mt-8 text-[13px] text-gray-400"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          style={fadeInStyle}
        >
          {pricingCopy.footnote}
        </motion.p>
      </div>
    </section>
  )
}

export default PricingSection
