import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { initializeTheme } from './hooks/use-appearance';
import { PRODUCT_NAME } from './lib/brand';
import { initEmbeddedNav } from './lib/embedded';
import { installEnterToNext } from './lib/enter-to-next';

declare global {
    const route: typeof routeFn;
}

createInertiaApp({
    title: (title) => title ? `${title} - ${PRODUCT_NAME}` : PRODUCT_NAME,
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(<App {...props} />);
    },
    progress: {
        color: 'var(--color-brand-mint, #35d6b2)',
    },
});

// This will set light / dark mode on load...
initializeTheme();

// Enter moves to the next field in all forms (desktop accounting behavior).
installEnterToNext();

// The active workspace view handles navigation and its draft leave guard.
initEmbeddedNav();
