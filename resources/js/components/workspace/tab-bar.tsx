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
        <div className="flex items-stretch border-b bg-muted/30 pt-1">
            <div className="flex flex-1 items-stretch gap-1 overflow-x-auto px-2">
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
                            'group flex max-w-56 min-w-32 cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 text-sm select-none',
                            active
                                ? 'bg-background font-medium text-foreground'
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
                    className="mr-2 flex shrink-0 items-center gap-1 self-center rounded px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                >
                    <XCircle className="size-3.5" />
                    Close all
                </button>
            )}
        </div>
    );
}
