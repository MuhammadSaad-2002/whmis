import { type Tab } from '@/hooks/use-tabs';
import { cn } from '@/lib/utils';
import { X, XCircle } from 'lucide-react';

interface TabBarProps {
    tabs: Tab[];
    activeId: string;
    onFocus: (id: string) => void;
    onClose: (id: string) => void;
    onCloseAll: () => void;
}

export function TabBar({ tabs, activeId, onFocus, onClose, onCloseAll }: TabBarProps) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2" role="group" aria-label="Workspace tabs">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-0.5">
                {tabs.map((tab) => {
                    const active = tab.id === activeId;
                    return (
                        <div key={tab.id} className={cn('flex max-w-56 min-w-0 shrink-0 items-center rounded-md border',
                            active ? 'border-primary bg-primary font-medium text-primary-foreground' : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground')}>
                            <button type="button" aria-pressed={active} title={tab.title} onClick={() => onFocus(tab.id)}
                                className="min-w-0 truncate rounded-l-md py-1.5 pr-2 pl-2.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2">{tab.title}</button>
                            <button type="button" aria-label={`Close ${tab.title}`} onClick={() => onClose(tab.id)}
                                className="mr-1 grid size-6 shrink-0 place-items-center rounded opacity-75 hover:bg-current/10 hover:opacity-100 focus-visible:outline-2">
                                <X aria-hidden="true" className="size-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button type="button" onClick={onCloseAll} aria-label="Close all tabs"
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2">
                <XCircle aria-hidden="true" className="size-3.5" /> Close all
            </button>
        </div>
    );
}
