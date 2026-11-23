import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
    const query = `(width < ${breakpoint}px)`;
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

    useEffect(() => {
        const mql = window.matchMedia(query);

        const onChange = () => {
            setIsMobile(mql.matches);
        };

        mql.addEventListener('change', onChange);
        onChange();

        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return isMobile;
}
