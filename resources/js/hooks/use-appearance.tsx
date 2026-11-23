import { useEffect, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const applyTheme = (appearance: Appearance) => {
    const isDark = appearance === 'dark' || (appearance === 'system' && prefersDark());

    document.documentElement.classList.toggle('dark', isDark);
};

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

const savedAppearance = (): Appearance => (localStorage.getItem('appearance') as Appearance) || 'system';

const handleSystemThemeChange = () => {
    applyTheme(savedAppearance());
};

export function initializeTheme() {
    applyTheme(savedAppearance());

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    // Workspace pages run in separate frames. Apply their setting immediately
    // to the shell and other open pages without reloading or losing form state.
    window.addEventListener('storage', (event) => {
        if (event.key === 'appearance' || event.key === null) applyTheme(savedAppearance());
    });
}

export function useAppearance() {
    const [appearance, setAppearance] = useState<Appearance>('system');

    const updateAppearance = (mode: Appearance) => {
        setAppearance(mode);
        localStorage.setItem('appearance', mode);
        applyTheme(mode);
    };

    useEffect(() => {
        setAppearance(savedAppearance());
        const syncAppearance = (event: StorageEvent) => {
            if (event.key === 'appearance' || event.key === null) setAppearance(savedAppearance());
        };

        window.addEventListener('storage', syncAppearance);
        return () => window.removeEventListener('storage', syncAppearance);
    }, []);

    return { appearance, updateAppearance };
}
