import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ReturnLineOption {
    value: string; // invoice line id as string
    label: string;
}

interface Props {
    value: string;
    options: ReturnLineOption[];
    onSelect: (value: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    registerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * In-grid product picker for returns — a dropdown limited to the chosen
 * invoice's returnable lines (product · supplier · batch). Same keyboard-grid
 * wiring as the batch cell on the sales form.
 */
export function ReturnLineCell({ value, options, onSelect, disabled, invalid, registerRef, onKeyDown }: Props) {
    const ring = invalid ? 'bg-destructive/10 ring-1 ring-destructive' : '';
    return (
        <Select value={value || undefined} onValueChange={onSelect} disabled={disabled}>
            <SelectTrigger
                ref={registerRef as never}
                onKeyDown={onKeyDown}
                aria-invalid={invalid}
                className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${ring}`}
            >
                <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
