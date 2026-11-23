import { openWorkspaceTab } from '@/lib/embedded';
import { Link } from '@inertiajs/react';
import { ExternalLink } from 'lucide-react';

export function WorkspaceRecordLink({ href, number }: { href: string; number: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <Link href={href} className="font-medium hover:underline">{number}</Link>
            <button type="button" className="hidden size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring lg:grid"
                aria-label={`Open ${number} in workspace tab`} title="Open in workspace tab"
                onClick={(event) => { event.stopPropagation(); openWorkspaceTab(href); }}>
                <ExternalLink aria-hidden="true" className="size-3.5" />
            </button>
        </span>
    );
}
