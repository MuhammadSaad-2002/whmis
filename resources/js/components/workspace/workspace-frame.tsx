import { Loader2 } from 'lucide-react';
import { memo, useRef, useState } from 'react';

interface WorkspaceFrameProps {
    id: string;
    src: string;
    title: string;
    active: boolean;
    registerRef: (id: string, el: HTMLIFrameElement | null) => void;
}

// One iframe per open tab. Kept mounted while the tab is open (only visibility
// toggles), so switching tabs never reloads or refetches.
function WorkspaceFrameInner({ id, src, title, active, registerRef }: WorkspaceFrameProps) {
    // Freeze the src at mount. After this, navigation inside the frame is the
    // iframe's OWN history; pushing an updated src prop onto the element would
    // reload it and wipe its state, so we deliberately never do that.
    const initialSrc = useRef(src);
    // Show a loader until the frame's document finishes loading. (In-frame Inertia
    // navigations are XHR — they don't fire `load` — and carry their own top
    // progress bar, so this only covers the initial full-page load of the tab.)
    const [loaded, setLoaded] = useState(false);

    return (
        <div className="absolute inset-0" style={{ display: active ? 'block' : 'none' }}>
            <iframe
                ref={(el) => registerRef(id, el)}
                src={initialSrc.current}
                title={title}
                onLoad={() => setLoaded(true)}
                className="absolute inset-0 h-full w-full border-0"
            />
            {!loaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading…</span>
                </div>
            )}
        </div>
    );
}

// Re-render only when active toggles (or the a11y title changes); the frozen src
// means those re-renders never reload the frame. Internal load state still
// re-renders normally regardless of this comparator.
export const WorkspaceFrame = memo(
    WorkspaceFrameInner,
    (prev, next) => prev.id === next.id && prev.active === next.active && prev.title === next.title,
);
