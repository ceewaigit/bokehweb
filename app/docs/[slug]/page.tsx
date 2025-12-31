import { notFound } from "next/navigation";
import { docsNav } from "@/lib/docs";
import { DocsPrevNext } from "@/components/docs/docs-prev-next";
import { docContentMap } from "@/components/docs/docs-content";

export function generateStaticParams() {
    return docsNav.map((item) => ({ slug: item.slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const content = docContentMap[slug];

    if (!content) {
        notFound();
    }

    return (
        <div className="space-y-10">
            {content}
            <DocsPrevNext slug={slug} />
        </div>
    );
}
