import { memo, useRef } from 'react';

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

    return (
        <iframe
            ref={(el) => registerRef(id, el)}
            src={initialSrc.current}
            title={title}
            className="absolute inset-0 h-full w-full border-0"
            style={{ display: active ? 'block' : 'none' }}
        />
    );
}

// Re-render only when active toggles (or the a11y title changes); the frozen src
// means those re-renders never reload the frame.
export const WorkspaceFrame = memo(
    WorkspaceFrameInner,
    (prev, next) => prev.id === next.id && prev.active === next.active && prev.title === next.title,
);
