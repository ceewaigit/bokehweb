import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#FBFBFD] relative overflow-hidden font-sans selection:bg-slate-900/10">
            <div className="relative mx-auto max-w-3xl px-6 py-24 sm:py-32">
                <div className="mb-16">
                    <Link
                        href="/"
                        className="inline-flex items-center text-[13px] font-medium text-slate-500 hover:text-slate-900 mb-8 transition-colors tracking-wide"
                    >
                        <svg className="mr-2 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back home
                    </Link>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl mb-4 font-display">
                        Privacy Policy
                    </h1>
                    <p className="text-[15px] text-slate-500">
                        Last updated: December 21, 2025
                    </p>
                </div>

                <div className="prose prose-slate prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-indigo-600 hover:prose-a:text-indigo-500">
                    <p>
                        Privacy is core to bokeh. We follow a few clear principles:
                    </p>
                    <ul>
                        <li>We don't ask you for personal information unless we truly need it.</li>
                        <li>We don't share your personal information with anyone except to comply with the law, develop our products, or protect our rights.</li>
                        <li>We don't store personal information on our servers unless required for the on-going operation of one of our services.</li>
                    </ul>

                    <h3>1. Local-first architecture</h3>
                    <p>
                        bokeh is built local-first. Recordings, audio, and projects are stored on your device. We don’t access your content, and we don’t upload recordings to our servers.
                    </p>

                    <h3>2. Data collection</h3>
                    <p>
                        We collect minimal data necessary to operate the service:
                    </p>
                    <ul>
                        <li><strong>Account Information:</strong> If you purchase a pro license, we collect your email address and license key status.</li>
                        <li><strong>Usage Analytics:</strong> We may collect anonymous, aggregated telemetry (app version, OS version, performance metrics) to improve stability. You can opt out at any time in settings.</li>
                    </ul>

                    <h3>3. Third-party services</h3>
                    <p>
                        We may use third-party services for specific functions, such as payment processing (e.g., Stripe) or email delivery. These services have their own privacy policies, and we only share the minimum necessary data with them to facilitate their specific service.
                    </p>

                    <h3>4. Security</h3>
                    <p>
                        We take the security of your data seriously. Since your recordings are stored locally, the security of your content primarily depends on the security of your own device. For any data we do transmit (like license validation), we use industry-standard encryption (TLS/SSL).
                    </p>

                    <h3>5. Changes to this policy</h3>
                    <p>
                        We may update this policy from time to time. Please check this page for changes. Continued use of the site means you accept the updated policy.
                    </p>

                    <h3>6. Contact us</h3>
                    <p>
                        If you have any questions about our Privacy Policy, please contact us at privacy@bokeh.app.
                    </p>
                </div>
            </div>
        </div>
    );
}
