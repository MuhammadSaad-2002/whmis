import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Command-palette-style keyboard navigation for a searchable list/table.
 *
 * The search input keeps focus; ↑/↓ move a highlighted row and Enter opens it
 * (via `onActivate`). No per-row DOM focus is taken, so typing-to-filter and
 * row navigation coexist. Mouse hover syncs the highlight; existing per-row
 * buttons/links keep working because rows get no `onClick`.
 */
export function useListKeyboardNav({
    rowCount,
    onActivate,
}: {
    rowCount: number;
    onActivate: (index: number) => void;
}) {
    const searchRef = useRef<HTMLInputElement>(null);
    const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
    const [highlighted, setHighlighted] = useState(0);

    // Focus the search box on first mount.
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    // Keep the highlight within range as the (filtered) row set changes.
    useEffect(() => {
        setHighlighted((h) => Math.min(Math.max(0, h), Math.max(0, rowCount - 1)));
    }, [rowCount]);

    // Keep the highlighted row visible.
    useEffect(() => {
        rowRefs.current.get(highlighted)?.scrollIntoView({ block: 'nearest' });
    }, [highlighted]);

    const onSearchKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (rowCount === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, rowCount - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onActivate(highlighted);
            }
        },
        [rowCount, highlighted, onActivate],
    );

    const rowProps = useCallback(
        (index: number) => ({
            ref: (el: HTMLTableRowElement | null) => {
                if (el) rowRefs.current.set(index, el);
                else rowRefs.current.delete(index);
            },
            onMouseEnter: () => setHighlighted(index),
            'data-highlighted': index === highlighted ? '' : undefined,
            className: index === highlighted ? 'bg-muted/60' : undefined,
        }),
        [highlighted],
    );

    return { searchRef, highlighted, onSearchKeyDown, rowProps };
}
