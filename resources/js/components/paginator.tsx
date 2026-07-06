import { Button } from '@/components/ui/button';
import { Link } from '@inertiajs/react';

export interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

export function Paginator({ meta }: { meta: PaginatedData<unknown> }) {
    if (meta.last_page <= 1) return null;

    return (
        <div className="flex items-center justify-between gap-2 px-1 py-3">
            <p className="text-sm text-muted-foreground">
                {meta.from ?? 0}–{meta.to ?? 0} of {meta.total}
            </p>
            <div className="flex gap-1">
                {meta.links.map((link, index) => {
                    const label = link.label.replace('&laquo;', '«').replace('&raquo;', '»');
                    if (!link.url) {
                        return (
                            <Button key={index} variant="ghost" size="sm" disabled>
                                <span dangerouslySetInnerHTML={{ __html: label }} />
                            </Button>
                        );
                    }
                    return (
                        <Button key={index} variant={link.active ? 'default' : 'outline'} size="sm" asChild>
                            <Link href={link.url} preserveScroll preserveState>
                                <span dangerouslySetInnerHTML={{ __html: label }} />
                            </Link>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
