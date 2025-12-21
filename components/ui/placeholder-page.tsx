import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

interface PlaceholderPageProps {
    title: string;
    description?: string;
    className?: string;
}

export function PlaceholderPage({ title, description, className }: PlaceholderPageProps) {
    return (
        <div className={cn("min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-50", className)}>
            {/* Background Effects */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-indigo-500 opacity-20 blur-[100px]" />

            <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-md mx-auto">
                <div className="mb-8 p-4 bg-white/50 rounded-3xl border border-white/50 shadow-xl backdrop-blur-xl">
                    <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-lg">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-4 font-display">
                    {title}
                </h1>

                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                    {description || "We’re shaping this page now. Check back soon for a clearer update."}
                </p>

                <Link
                    href="/"
                    className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-slate-900 text-white font-medium shadow-lg hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                >
                    Back home
                </Link>
            </div>
        </div>
    );
}
