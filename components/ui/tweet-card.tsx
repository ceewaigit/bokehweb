"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface TweetCardProps extends HTMLMotionProps<"div"> {
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

const TweetCard = forwardRef<HTMLDivElement, TweetCardProps>(
    ({ className, content, author, stats, date, ...props }, ref) => {
        return (
            <motion.div
                ref={ref}
                className={cn(
                    "relative bg-white/85 text-slate-900 rounded-[24px] p-6",
                    "backdrop-blur-lg",
                    "shadow-[0_8px_24px_rgba(15,23,42,0.08),0_1px_0_rgba(255,255,255,0.9)_inset]",
                    "hover:shadow-[0_12px_32px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.95)_inset]",
                    "hover:scale-[1.005]",
                    "transition-all duration-300 ease-out",
                    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[24px] before:bg-[radial-gradient(circle_at_15%_0%,rgba(255,255,255,0.5),transparent_60%)]",
                    className
                )}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                {...props}
            >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                    {/* Avatar */}
                    {author.avatar ? (
                        <img
                            src={author.avatar}
                            alt={author.name}
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-semibold text-lg flex-shrink-0">
                            {author.name.charAt(0)}
                        </div>
                    )}

                    {/* Author Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="font-bold text-foreground truncate">
                                {author.name}
                            </span>
                            {author.verified && (
                                <svg className="w-4 h-4 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                                </svg>
                            )}
                        </div>
                        {author.title && (
                            <span className="text-muted-foreground text-sm">{author.title}</span>
                        )}
                        {!author.title && author.handle && (
                            <span className="text-muted-foreground text-sm">@{author.handle}</span>
                        )}
                    </div>

                    {/* X Logo */}
                    {author.handle && (
                        <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    )}
                </div>

                {/* Content */}
                <p className="text-[15px] text-foreground/90 leading-relaxed mb-4 whitespace-pre-wrap">
                    {content}
                </p>

                {/* Date */}
                {date && (
                    <p className="text-muted-foreground text-sm mb-3">{date}</p>
                )}

                {/* Stats */}
                {stats && (
                    <div className="flex items-center gap-6 pt-3 border-t border-border/60">
                        {stats.replies !== undefined && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span>{stats.replies}</span>
                            </div>
                        )}
                        {stats.retweets !== undefined && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>{stats.retweets}</span>
                            </div>
                        )}
                        {stats.likes !== undefined && (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                <span>{stats.likes}</span>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        );
    }
);

TweetCard.displayName = "TweetCard";

export { TweetCard };
