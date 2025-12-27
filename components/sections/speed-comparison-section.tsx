"use client";

import { cn } from "@/lib/utils";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useEffect, useState } from "react";

export function SpeedComparisonSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const [hasAnimated, setHasAnimated] = useState(false);

  const bokehProgress = useMotionValue(0);
  const traditionalProgress = useMotionValue(0);

  const bokehWidth = useTransform(bokehProgress, [0, 3], ["0%", "6%"]);
  const traditionalWidth = useTransform(traditionalProgress, [0, 47], ["0%", "94%"]);
  const bokehMinutes = useTransform(bokehProgress, (v) => Math.round(v));
  const traditionalMinutes = useTransform(traditionalProgress, (v) => Math.round(v));

  useEffect(() => {
    if (isInView && !hasAnimated) {
      setHasAnimated(true);
      animate(bokehProgress, 3, { duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 });
      animate(traditionalProgress, 47, { duration: 2, ease: [0.22, 1, 0.36, 1], delay: 0.6 });
    }
  }, [isInView, hasAnimated, bokehProgress, traditionalProgress]);

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 md:py-40 overflow-hidden"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-16 sm:mb-20"
        >
          <p className="text-sm font-medium tracking-[0.2em] uppercase text-violet-600 mb-2">
            Editing time
          </p>
          <h2 className="text-[2.5rem] sm:text-5xl md:text-6xl font-medium tracking-[-0.03em] text-slate-900 leading-[1.1]">
            <span className="relative inline-block">
              Minutes
              {/* Refined hand-drawn pen underline */}
              <motion.svg
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: 0.4 }}
                className="absolute -bottom-1 sm:-bottom-2 left-[-2%] w-[104%] h-3 sm:h-4 pointer-events-none"
                viewBox="0 0 100 12"
                preserveAspectRatio="none"
                fill="none"
              >
                <motion.path
                  d="M 2 7 Q 25 4, 50 6.5 Q 75 9, 98 5.5"
                  stroke="url(#underline-gradient)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
                <defs>
                  <linearGradient id="underline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(139, 92, 246, 0.7)" />
                    <stop offset="50%" stopColor="rgba(139, 92, 246, 0.55)" />
                    <stop offset="100%" stopColor="rgba(139, 92, 246, 0.35)" />
                  </linearGradient>
                </defs>
              </motion.svg>
            </span>
            , not hours.
          </h2>
        </motion.div>

        {/* Comparison bars */}
        <div className="space-y-8 sm:space-y-10">
          {/* Bokeh bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-base sm:text-lg font-medium text-slate-900">
                bokeh.
              </span>
              <div className="flex items-baseline gap-1">
                <motion.span
                  className="text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900"
                >
                  {bokehMinutes}
                </motion.span>
                <span className="text-sm text-slate-400">min</span>
              </div>
            </div>
            <div className="relative h-2 sm:h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                style={{ width: bokehWidth, willChange: "width" }}
              />
              <div className={cn(
                "absolute inset-0 bg-white/20"
              )} />
            </div>
          </motion.div>

          {/* Traditional bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-base sm:text-lg font-medium text-slate-400">
                Traditional editing
              </span>
              <div className="flex items-baseline gap-1">
                <motion.span
                  className="text-2xl sm:text-3xl font-semibold tabular-nums text-slate-400"
                >
                  {traditionalMinutes}
                </motion.span>
                <span className="text-sm text-slate-300">min</span>
              </div>
            </div>
            <div className="relative h-2 sm:h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-slate-300"
                style={{ width: traditionalWidth, willChange: "width" }}
              />
            </div>
          </motion.div>
        </div>

        {/* Stat callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-14 sm:mt-16 pt-10 sm:pt-12 border-t border-slate-100"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400 mb-1">Editing time per video</p>
              <p className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.03em] text-slate-900">
                15<span className="text-violet-500">×</span> faster
              </p>
            </div>
            <p className="text-sm text-slate-400 max-w-[220px]">
              Time to edit a 10-min demo
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
