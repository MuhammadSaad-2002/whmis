import { cn } from '@/lib/utils';
import { X, XCircle } from 'lucide-react';
import { type Tab } from '@/hooks/use-tabs';

interface TabBarProps {
    tabs: Tab[];
    activeId: string;
    onFocus: (id: string) => void;
    onClose: (id: string) => void;
    onCloseAll: () => void;
}

export function TabBar({ tabs, activeId, onFocus, onClose, onCloseAll }: TabBarProps) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
                const active = tab.id === activeId;
                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onFocus(tab.id)}
                        onAuxClick={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                onClose(tab.id);
                            }
                        }}
                        className={cn(
                            'group flex max-w-56 min-w-28 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 text-sm select-none transition-colors',
                            active
                                ? 'border-primary bg-primary font-medium text-primary-foreground shadow-sm'
                                : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        title={tab.title}
                    >
                        <span className="truncate">{tab.title}</span>
                        <button
                            type="button"
                            aria-label={`Close ${tab.title}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose(tab.id);
                            }}
                            className={cn(
                                'ml-auto rounded p-0.5 opacity-70 hover:opacity-100',
                                active ? 'hover:bg-primary-foreground/20' : 'hover:bg-background',
                            )}
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                );
            })}
            </div>
            {tabs.length > 1 && (
                <button
                    type="button"
                    onClick={onCloseAll}
                    title="Close all tabs"
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <XCircle className="size-3.5" />
                    Close all
                </button>
            )}
        </div>
    );
}
