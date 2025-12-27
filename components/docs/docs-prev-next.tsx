import Link from "next/link";
import { getPrevNext } from "@/lib/docs";

export function DocsPrevNext({ slug }: { slug: string }) {
    const { prev, next } = getPrevNext(slug);

    if (!prev && !next) {
        return null;
    }

    return (
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {prev ? (
                <Link
                    href={`/docs/${prev.slug}`}
                    className="group rounded-2xl border border-slate-200/70 bg-white/80 p-5 text-sm text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-slate-900"
                >
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Previous</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{prev.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{prev.description}</p>
                </Link>
            ) : (
                <div className="hidden sm:block" />
            )}
            {next ? (
                <Link
                    href={`/docs/${next.slug}`}
                    className="group rounded-2xl border border-slate-200/70 bg-white/80 p-5 text-sm text-slate-600 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-slate-900"
                >
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next</p>
                    <p className="mt-2 text-base font-semibold text-slate-900">{next.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{next.description}</p>
                </Link>
            ) : (
                <div className="hidden sm:block" />
            )}
        </div>
    );
}
