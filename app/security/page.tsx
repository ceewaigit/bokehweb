import Link from "next/link";
import { ShieldCheck, Lock, Server, EyeOff } from "lucide-react"; // Using lucide-react if available, otherwise will replace with SVGs

// Fallback icons if lucide-react isn't available in this environment, using SVGs directly
const Icons = {
    Shield: (props: any) => (
        <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
    ),
    Lock: (props: any) => (
        <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
    ),
    Server: (props: any) => (
        <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
    ),
    EyeOff: (props: any) => (
        <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
    )
};

export default function SecurityPage() {
    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            {/* Background Gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-emerald-50/50 rounded-full blur-[120px] opacity-40" />
            </div>

            <div className="relative mx-auto max-w-5xl px-6 py-24 sm:py-32">
                <div className="mb-20 text-center">
                    <Link
                        href="/"
                        className="inline-flex items-center text-[13px] font-medium text-slate-500 hover:text-slate-900 mb-8 transition-colors tracking-wide"
                    >
                        <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back home
                    </Link>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl mb-6 font-display">
                        Security & Privacy
                    </h1>
                    <p className="text-[17px] leading-relaxed text-slate-500 max-w-2xl mx-auto">
                        Your recordings stay on your device. bokeh is built with a local-first model so privacy is the default.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    <div className="bg-white/60 p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-emerald-100/50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6">
                            <Icons.Server className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-3">Local-first by design</h3>
                        <p className="text-slate-600 leading-relaxed">
                            Recording, processing, and editing run on your machine. Your raw footage stays local unless you choose to share it.
                        </p>
                    </div>

                    <div className="bg-white/60 p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-blue-100/50 rounded-2xl flex items-center justify-center text-blue-600 mb-6">
                            <Icons.EyeOff className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-3">Private by default</h3>
                        <p className="text-slate-600 leading-relaxed">
                            We don’t inspect what you record. There are no background uploads or hidden content scanning.
                        </p>
                    </div>

                    <div className="bg-white/60 p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-indigo-100/50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
                            <Icons.Lock className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-3">Secure permissions</h3>
                        <p className="text-slate-600 leading-relaxed">
                            We use macOS frameworks so screen-recording access follows system-level privacy controls.
                        </p>
                    </div>

                    <div className="bg-white/60 p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-violet-100/50 rounded-2xl flex items-center justify-center text-violet-600 mb-6">
                            <Icons.Shield className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-3">You own your work</h3>
                        <p className="text-slate-600 leading-relaxed">
                            You own the content you create. Use it for personal or commercial work without restrictions.
                        </p>
                    </div>
                </div>

                <div className="mt-20 p-8 bg-slate-100 rounded-3xl text-center">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Have security questions?</h3>
                    <p className="text-slate-600 mb-6">
                        We’re happy to answer questions about security or privacy.
                    </p>
                    <a href="mailto:security@bokeh.app" className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-white text-slate-900 font-medium shadow-sm hover:shadow border border-slate-200 transition-all">
                        Contact security
                    </a>
                </div>
            </div>
        </div>
    );
}
