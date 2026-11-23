import { Button } from '@/components/ui/button';
import {
    Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
    value: string;
    label: string;
    hint?: string;
}

interface Props {
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
    id?: string;
    autoFocus?: boolean;
    touch?: boolean;
}

/**
 * A searchable single-select combobox (shadcn Popover + Command) over a
 * client-side list. Type to filter, ↑↓ to move, Enter/click to pick.
 * Portaled content keeps it clear of the invoice-header Enter navigation.
 */
export function SearchableSelect({
    value,
    onValueChange,
    options,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    emptyText = 'No results found.',
    disabled,
    className,
    id,
    autoFocus,
    touch,
}: Props) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        if (autoFocus) triggerRef.current?.focus();
    }, [autoFocus]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    ref={triggerRef}
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
                >
                    <span className="truncate">{selected ? selected.label : placeholder}</span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) max-w-(--radix-popover-content-available-width) p-0" align="start">
                <Command
                    filter={(itemValue, search) =>
                        itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                >
                    <CommandInput placeholder={searchPlaceholder} className={touch ? 'h-12 text-base' : undefined} />
                    <CommandList className={touch ? 'max-h-[min(300px,40dvh)] overscroll-contain' : undefined}>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        {options.map((option) => (
                            <CommandItem
                                key={option.value}
                                value={option.label}
                                className={touch ? 'min-h-11 cursor-pointer' : undefined}
                                onSelect={() => {
                                    onValueChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <Check className={cn('mr-2 size-4', option.value === value ? 'opacity-100' : 'opacity-0')} />
                                <span className={touch ? 'min-w-0 break-words' : 'truncate'}>{option.label}</span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
