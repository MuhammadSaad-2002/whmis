import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import AppLogoIcon from './app-logo-icon';

export default function AppLogo({ variant = 'navigation' }: { variant?: 'navigation' | 'auth' }) {
    if (variant === 'auth') {
        return (
            <span className="flex flex-col items-center gap-2.5 text-center">
                <AppLogoIcon className="size-16 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/15" />
                <span>
                    <span className="block text-3xl leading-none font-bold tracking-tight">{PRODUCT_NAME}</span>
                    <span className="mt-2 block text-sm text-muted-foreground">{PRODUCT_TAGLINE}</span>
                </span>
            </span>
        );
    }

    return (
        <>
            <AppLogoIcon className="size-8 shrink-0 rounded-lg ring-1 ring-white/15" />
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="truncate leading-none font-semibold tracking-tight">{PRODUCT_NAME}</span>
            </div>
        </>
    );
}
