import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type NavItem } from '@/types';
import { ArrowRight, FileText } from 'lucide-react';
import { useRef } from 'react';

export type SearchGroup = { label: string; items: (Pick<NavItem, 'title' | 'url' | 'icon'> & { keywords?: string[] })[] };

export function GlobalSearch({ open, onOpenChange, groups, onNavigate }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: SearchGroup[];
    onNavigate: (url: string) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const destination = useRef<string | null>(null);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-1.5rem)] max-w-xl gap-0 overflow-hidden rounded-xl p-0 data-[state=closed]:animate-none data-[state=open]:animate-none"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    const active = document.activeElement;
                    returnFocus.current = active instanceof HTMLIFrameElement
                        ? active.contentDocument?.querySelector<HTMLElement>(':focus') ?? active
                        : active instanceof HTMLElement ? active : null;
                    input.current?.focus();
                }}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
                    returnFocus.current = null;
                    const url = destination.current;
                    destination.current = null;
                    // Let the palette release focus before the editor can show its leave prompt.
                    if (url) onNavigate(url);
                }}>
                <div className="space-y-1 border-b px-4 py-3 pr-12">
                    <DialogTitle className="leading-tight">Search pages</DialogTitle>
                    <DialogDescription>Find a page or report and open it in your current view.</DialogDescription>
                </div>
                <Command label="Find a page or report" loop vimBindings={false}>
                    <CommandInput ref={input} className="h-12 text-base" placeholder="Type a page or report name…" />
                    <CommandList className="max-h-[min(48dvh,24rem)] overscroll-contain p-1">
                        <CommandEmpty>No matching pages.</CommandEmpty>
                        {groups.filter(({ items }) => items.length > 0).map(({ label, items }) => (
                            <CommandGroup key={label} heading={label}>
                                {items.map(({ title, url, icon, keywords }) => {
                                    const Icon = icon ?? FileText;
                                    return (
                                        <CommandItem key={url} value={`${title} ${url}`} keywords={[label, ...(keywords ?? [])]}
                                            className="min-h-11 cursor-pointer gap-3 px-3 text-base"
                                            onSelect={() => { destination.current = url; onOpenChange(false); }}>
                                            <Icon aria-hidden="true" className="text-muted-foreground" />
                                            <span className="min-w-0 flex-1">{title}</span>
                                            <ArrowRight aria-hidden="true" className="text-muted-foreground" />
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
