import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SectionBackdrop } from "@/components/ui/section-backdrop";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-[#FBFBFD] page-backdrop relative overflow-hidden font-sans text-slate-900">
            <Navbar />
            <div className="fixed inset-0 pointer-events-none">
                <SectionBackdrop variant="shimmer" fade="all" className="opacity-40" />
                <SectionBackdrop variant="dots" texture fade="all" className="opacity-35" />
            </div>

            <main className="relative mx-auto max-w-6xl px-6 pb-24 pt-28 sm:pt-32">
                <div className="grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="lg:sticky lg:top-24 h-fit">
                        <DocsSidebar />
                    </aside>
                    <div className="min-w-0 rounded-[32px] border border-slate-200/70 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
                        {children}
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
