import Link from "next/link";

export default function TermsPage() {
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
                        Terms of Service
                    </h1>
                    <p className="text-[15px] text-slate-500">
                        Last updated: December 21, 2025
                    </p>
                </div>

                <div className="prose prose-slate prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-indigo-600 hover:prose-a:text-indigo-500">
                    <p>
                        Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the bokeh application (the "Service") operated by bokeh ("us", "we", or "our").
                    </p>

                    <h3>1. Acceptance of Terms</h3>
                    <p>
                        By accessing or using the Service you agree to be bound by these Terms. If you disagree with any part of the terms then you may not access the Service.
                    </p>

                    <h3>2. License</h3>
                    <p>
                        Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, non-sublicensable license to download and use a copy of the Service on a computer that you own or control and to run such copy of the Service solely for your own personal or internal business purposes.
                    </p>

                    <h3>3. Restrictions</h3>
                    <p>
                        You agree not to, and you will not permit others to:
                    </p>
                    <ul>
                        <li>License, sell, rent, lease, assign, distribute, transmit, host, outsource, disclose or otherwise commercially exploit the Service or make the Service available to any third party.</li>
                        <li>Modify, make derivative works of, disassemble, decrypt, reverse compile or reverse engineer any part of the Service.</li>
                        <li>Remove, alter or obscure any proprietary notice (including any notice of copyright or trademark) of bokeh or its affiliates, partners, suppliers or the licensors of the Service.</li>
                    </ul>

                    <h3>4. Content Ownership</h3>
                    <p>
                        You retain all rights, title, and interest in and to any videos, recordings, or other content you create using the Service ("User Content"). We claim no ownership rights over your User Content.
                    </p>

                    <h3>5. Updates and Support</h3>
                    <p>
                        We may from time to time provide enhancements or improvements to the features/functionality of the Service, which may include patches, bug fixes, updates, upgrades and other modifications ("Updates").
                    </p>

                    <h3>6. Disclaimer</h3>
                    <p>
                        The Service is provided to you "AS IS" and "AS AVAILABLE" and with all faults and defects without warranty of any kind. To the maximum extent permitted under applicable law, we expressly disclaim all warranties, whether express, implied, statutory or otherwise.
                    </p>

                    <h3>7. Limitation of Liability</h3>
                    <p>
                        In no event shall we be liable for any indirect, special, incidental, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
                    </p>

                    <h3>8. Changes to Terms</h3>
                    <p>
                        We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
                    </p>

                    <h3>9. Contact Us</h3>
                    <p>
                        If you have any questions about these Terms, please contact us at support@bokeh.app.
                    </p>
                </div>
            </div>
        </div>
    );
}
