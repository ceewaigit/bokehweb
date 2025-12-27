"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NeumorphicButton } from "@/components/ui/neumorphic-button";
import { cn } from "@/lib/utils";
import { gpuAccelerated } from "@/lib/animation-utils";
import Link from "next/link";

type SubmitState = "idle" | "loading" | "success" | "error";

interface MailingListSectionProps {
  className?: string;
}

export function MailingListSection({ className }: MailingListSectionProps) {
  const [status, setStatus] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const isLoading = status === "loading";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/mailing-list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), company: honeypot.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus("error");
        setMessage(data?.error || "Unable to subscribe right now.");
        return;
      }

      setStatus("success");
      setMessage(data?.double_opt_in ? "Check your inbox to confirm." : "You're on the list.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  };

  return (
    <section className={cn("relative py-12 sm:py-20 px-4 sm:px-6", className)}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(241,245,249,0.9) 0%, transparent 65%)",
          }}
        />
      </div>

      <motion.div
        className="relative mx-auto max-w-5xl"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={gpuAccelerated}
      >
        {/* Outer neumorphic card */}
        <div className="rounded-[24px] sm:rounded-[40px] bg-slate-100 p-5 sm:p-10 lg:p-12 shadow-[-12px_-12px_30px_#ffffff,12px_12px_30px_rgba(0,0,0,0.07)] sm:shadow-[-16px_-16px_40px_#ffffff,16px_16px_40px_rgba(0,0,0,0.08)]">
          <div className="grid gap-6 sm:gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:items-start">

            {/* Left column: Content */}
            <div className="space-y-4 sm:space-y-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                Newsletter
              </p>

              <h2 className="text-[28px] sm:text-4xl lg:text-[42px] tracking-[-0.025em] text-slate-900 leading-[1.1]">
                <span className="font-semibold">Updates worth</span>
                <br className="hidden sm:block" />{" "}
                <em className="font-[family-name:var(--font-display)] italic font-normal">waiting for</em>.
              </h2>

              <p className="text-[14px] sm:text-base text-slate-500 leading-relaxed">
                Thoughtful releases, behind-the-scenes notes, and early access, delivered only when there's something worth sharing.
              </p>

              <div className="flex flex-wrap gap-2 pt-1 sm:pt-2">
                {["Early access", "Process notes", "New releases"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-3 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-[12px] font-medium text-slate-500 shadow-[-3px_-3px_8px_rgba(255,255,255,0.9),3px_3px_8px_rgba(0,0,0,0.06)] sm:shadow-[-4px_-4px_10px_rgba(255,255,255,0.95),4px_4px_10px_rgba(0,0,0,0.08)] border border-slate-200/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Right column: Form card */}
            <div className="rounded-[20px] sm:rounded-[28px] bg-slate-100 p-5 sm:p-7 shadow-[-8px_-8px_20px_rgba(255,255,255,0.95),8px_8px_20px_rgba(0,0,0,0.08)] sm:shadow-[-10px_-10px_24px_rgba(255,255,255,0.95),10px_10px_24px_rgba(0,0,0,0.1)]">

              <form onSubmit={handleSubmit} noValidate className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2 block">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@studio.com"
                    className="h-11 sm:h-12 w-full rounded-full bg-slate-100 px-4 sm:px-5 text-[14px] sm:text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[inset_-3px_-3px_8px_rgba(255,255,255,0.9),inset_3px_3px_8px_rgba(0,0,0,0.08)] sm:shadow-[inset_-4px_-4px_10px_rgba(255,255,255,0.95),inset_4px_4px_10px_rgba(0,0,0,0.1)] transition-shadow focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                {/* Honeypot */}
                <input
                  type="text"
                  name="company"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                <NeumorphicButton
                  type="submit"
                  className="w-full h-11 sm:h-12 text-[14px] sm:text-[15px] font-semibold text-slate-700"
                  disabled={isLoading}
                >
                  {isLoading ? "Joining..." : "Notify me"}
                </NeumorphicButton>
              </form>

              <p className="mt-3 sm:mt-4 text-[12px] sm:text-[13px] text-slate-400 min-h-[18px]" aria-live="polite">
                {status === "success" && <span className="text-emerald-600">{message}</span>}
                {status === "error" && <span className="text-rose-500">{message}</span>}
                {status === "idle" && "No spam. Just the best updates, infrequently."}
              </p>

              <p className="mt-4 sm:mt-5 text-[10px] sm:text-[11px] text-slate-400">
                By subscribing, you agree to our{" "}
                <Link href="/privacy" className="text-slate-500 underline underline-offset-2 hover:text-slate-700 transition-colors">
                  Privacy Policy
                </Link>.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
