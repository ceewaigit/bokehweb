export type DocNavItem = {
    slug: string;
    title: string;
    description: string;
};

export const docsNav: DocNavItem[] = [
    {
        slug: "quick-start",
        title: "Quick start",
        description: "Record your first capture in minutes.",
    },
    {
        slug: "installing",
        title: "Installing the app",
        description: "Download, move to Applications, launch.",
    },
    {
        slug: "system-requirements",
        title: "System requirements",
        description: "Hardware, OS, and storage guidance.",
    },
    {
        slug: "setup-permissions",
        title: "Setup & permissions",
        description: "Grant macOS access for recording.",
    },
    {
        slug: "activation",
        title: "Activating the app",
        description: "Unlock Pro features with your key.",
    },
    {
        slug: "recording-editing",
        title: "Recording & editing",
        description: "Capture controls and editing tools.",
    },
    {
        slug: "troubleshooting",
        title: "Troubleshooting",
        description: "Fix common issues quickly.",
    },
    {
        slug: "account-access",
        title: "Managing account access",
        description: "Move licenses and manage seats.",
    },
];

export function getDocIndex(slug: string) {
    return docsNav.findIndex((item) => item.slug === slug);
}

export function getPrevNext(slug: string) {
    const index = getDocIndex(slug);
    if (index === -1) {
        return { prev: null, next: null };
    }
    return {
        prev: docsNav[index - 1] ?? null,
        next: docsNav[index + 1] ?? null,
    };
}
