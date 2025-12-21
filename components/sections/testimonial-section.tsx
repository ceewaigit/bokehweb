"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { TweetCard } from "@/components/ui/tweet-card";

interface Testimonial {
    content: string;
    author: {
        name: string;
        handle?: string;
        title?: string;
        avatar?: string;
        verified?: boolean;
    };
    stats?: {
        likes?: number;
        retweets?: number;
        replies?: number;
    };
    date?: string;
}

interface TestimonialSectionProps {
    className?: string;
    title?: React.ReactNode;
    subtitle?: string;
    testimonials: Testimonial[];
}

export function TestimonialSection({
    className,
    title = "Loved by creators",
    subtitle,
    testimonials,
}: TestimonialSectionProps) {
    const fadeInStyle = { opacity: 0 };

    return (
        <section className={cn("relative py-24 px-6 overflow-hidden", className)}>
            <SectionBackdrop variant="grid" texture fade="all" className="opacity-40" />

            <div className="mx-auto max-w-6xl">
                {/* Section Header */}
                <div className="text-center mb-12">
                    <motion.h2
                        className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-balance mb-4 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        style={fadeInStyle}
                    >
                        {title}
                    </motion.h2>
                    {subtitle && (
                        <motion.p
                            className="text-lg text-muted-foreground max-w-xl mx-auto"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                            style={fadeInStyle}
                        >
                            {subtitle}
                        </motion.p>
                    )}
                </div>

                {/* Masonry-style Testimonial Grid */}
                <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
                    {testimonials.map((testimonial, index) => (
                        <TweetCard
                            key={testimonial.author.name}
                            content={testimonial.content}
                            author={{
                                name: testimonial.author.name,
                                handle: testimonial.author.handle,
                                title: testimonial.author.title,
                                avatar: testimonial.author.avatar,
                                verified: testimonial.author.verified,
                            }}
                            stats={testimonial.stats}
                            date={testimonial.date}
                            className="break-inside-avoid mb-4"
                            transition={{ delay: index * 0.06 }}
                        />
                    ))}
                </div>

                {/* View More Link */}
                <motion.div
                    className="text-center mt-10"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    style={fadeInStyle}
                >
                    <a
                        href="#"
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors inline-flex items-center gap-1.5"
                    >
                        See more on
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    </a>
                </motion.div>
            </div>
        </section>
    );
}
