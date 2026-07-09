import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useEffect, useRef, useState } from 'react';

export interface ReturnLineOption {
    value: string; // invoice line id as string
    label: string;
}

interface Props {
    value: string; // selected line's label, shown while the dropdown is closed
    options: ReturnLineOption[];
    disabled?: boolean;
    invalid?: boolean;
    /** Increment to force-open the dropdown (F2 pressed elsewhere in the row). */
    openSignal?: number;
    onSelect: (value: string) => void;
    /** Grid navigation handler — receives keys only while the dropdown is closed. */
    onGridKeyDown: (e: React.KeyboardEvent) => void;
    /** useKeyboardGrid registerCell ref for this cell. */
    inputRef: (el: HTMLElement | null) => void;
}

/**
 * In-grid product picker for returns — the same type-to-search combobox as the
 * sales/purchase forms' ProductSearchCell, but filtering the chosen invoice's
 * returnable lines client-side (no lookup fetch).
 */
export function ReturnLineCell({ value, options, disabled, invalid, openSignal, onSelect, onGridKeyDown, inputRef }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const localInput = useRef<HTMLInputElement | null>(null);

    const filtered = query.trim()
        ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
        : options;

    // F2 from another cell in the row: focus + open.
    const lastSignal = useRef(openSignal ?? 0);
    useEffect(() => {
        if (openSignal && openSignal !== lastSignal.current) {
            lastSignal.current = openSignal;
            localInput.current?.focus();
            openDropdown();
        }
    }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep the highlighted row visible.
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-index="${highlight}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const openDropdown = () => {
        setQuery('');
        setHighlight(0);
        setOpen(true);
    };

    const select = (option: ReturnLineOption) => {
        setOpen(false);
        setQuery('');
        onSelect(option.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (filtered[highlight]) select(filtered[highlight]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery('');
            } else if (e.key === 'Tab') {
                setOpen(false);
                setQuery('');
            } else if (e.key === 'F2') {
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'F2' || (e.key === 'Enter' && !value)) {
            e.preventDefault();
            openDropdown();
            return;
        }

        onGridKeyDown(e);
    };

    return (
        <Popover open={open}>
            <PopoverAnchor asChild>
                <Input
                    ref={(el) => {
                        localInput.current = el;
                        inputRef(el);
                    }}
                    value={open ? query : value}
                    disabled={disabled}
                    placeholder="Type to search… (F2)"
                    aria-invalid={invalid}
                    onChange={(e) => {
                        if (!open) setOpen(true);
                        setQuery(e.target.value);
                        setHighlight(0);
                    }}
                    onKeyDown={handleKeyDown}
                    className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${invalid ? 'bg-destructive/10 ring-1 ring-destructive' : ''}`}
                    autoComplete="off"
                />
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={2}
                className="w-[32rem] max-w-[90vw] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={() => {
                    setOpen(false);
                    setQuery('');
                }}
            >
                <div ref={listRef} className="max-h-72 overflow-y-auto">
                    {filtered.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No products found.</p>
                    )}
                    {filtered.map((option, index) => (
                        <div
                            key={option.value}
                            data-index={index}
                            role="option"
                            aria-selected={index === highlight}
                            onMouseDown={(e) => e.preventDefault()} // keep focus in the cell
                            onClick={() => select(option)}
                            onMouseEnter={() => setHighlight(index)}
                            className={`cursor-pointer border-b px-3 py-1.5 text-sm last:border-0 ${
                                index === highlight ? 'bg-accent text-accent-foreground' : ''
                            }`}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
