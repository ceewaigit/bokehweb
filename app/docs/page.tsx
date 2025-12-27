import Link from "next/link";
import { docsNav } from "@/lib/docs";
import { Button } from "@/components/ui/button";
import { DocCard, Kbd } from "@/components/docs/docs-elements";

export default function DocsPage() {
    return (
        <div className="space-y-12">
            <header className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400 font-[family-name:var(--font-geist-mono)]">
                    Documentation
                </p>
                <h1 className="mt-4 text-4xl font-semibold text-slate-900 sm:text-5xl page-title text-balance">
                    How to use <em>bokeh.</em>
                </h1>
                <p className="mt-4 text-[17px] leading-relaxed text-slate-600 text-balance">
                    Clear, skimmable guides that mirror the product: calm, focused, and fast. Each page covers one
                    subject, with shortcuts and key settings highlighted.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    Jump in with
                    <Kbd>Cmd</Kbd>
                    <Kbd>Shift</Kbd>
                    <Kbd>2</Kbd>
                    when you are ready to record.
                </div>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
                {docsNav.map((item) => (
                    <DocCard key={item.slug} title={item.title} description={item.description}>
                        <div className="mt-4">
                            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs uppercase tracking-[0.2em]">
                                <Link href={`/docs/${item.slug}`}>Open guide</Link>
                            </Button>
                        </div>
                    </DocCard>
                ))}
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-[family-name:var(--font-geist-mono)]">
                            Need a fast start?
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-900 text-balance">
                            Install, grant permissions, press record.
                        </h2>
                    </div>
                    <Button asChild size="sm" className="rounded-full px-4 py-2 text-[13px]">
                        <Link href="/docs/quick-start">Quick start</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
