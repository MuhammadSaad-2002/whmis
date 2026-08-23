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
                            'group flex max-w-56 min-w-28 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-1 text-sm select-none',
                            active
                                ? 'border-border bg-background font-medium text-foreground shadow-sm'
                                : 'border-transparent text-muted-foreground hover:bg-background/60',
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
                            className="ml-auto rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
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
                    className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                >
                    <XCircle className="size-3.5" />
                    Close all
                </button>
            )}
        </div>
    );
}
