import { AppFooter } from '@/components/app-footer';
import AppLogoIcon from '@/components/app-logo-icon';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import { Link } from '@inertiajs/react';

interface AuthLayoutProps {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="flex min-h-svh flex-col bg-background">
            <main className="flex w-full flex-1 items-center justify-center px-4 py-6 sm:p-8">
                <div className="grid w-full max-w-lg overflow-hidden rounded-3xl border bg-card shadow-[0_22px_64px_-36px_rgba(16,36,58,0.5)] lg:max-w-5xl lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="brand-panel relative isolate flex flex-col justify-between gap-3 overflow-hidden px-5 py-5 sm:px-8 lg:min-h-[34rem] lg:gap-12 lg:p-10 xl:p-12">
                        <Link href={route('home')} className="inline-flex w-fit items-center gap-2.5 rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-mint">
                            <AppLogoIcon className="size-10 rounded-xl ring-1 ring-white/20 lg:size-12" />
                            <span className="text-xl tracking-tight lg:text-2xl">{PRODUCT_NAME}</span>
                        </Link>

                        <p className="text-sm sm:text-base lg:max-w-[11em] lg:pb-24 lg:text-4xl lg:leading-tight lg:font-semibold lg:tracking-tight">
                            {PRODUCT_TAGLINE}
                        </p>

                        <svg aria-hidden="true" viewBox="0 0 424 176" fill="none" className="pointer-events-none absolute right-0 bottom-0 -z-10 hidden w-full text-brand-mint lg:block">
                            <path d="M-8 150h116l96-96h228M-8 175h144L246 65h186M-8 125h84l72-72h38" stroke="currentColor" strokeOpacity=".24" />
                            <path d="M135 176 245 66h179v110z" fill="currentColor" fillOpacity=".065" />
                            <circle cx="204" cy="54" r="4" fill="currentColor" />
                            <circle cx="246" cy="65" r="4" fill="currentColor" fillOpacity=".45" />
                            <path d="M335 109h33m-16.5-16.5v33M390 138h16m-8-8v16" stroke="currentColor" strokeOpacity=".35" />
                        </svg>
                    </div>

                    <div className="flex flex-col justify-center px-5 pt-6 pb-7 sm:px-8 sm:py-10 lg:p-12">
                        <div className="mb-6 space-y-2 sm:mb-7">
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                            {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
                        </div>
                        {children}
                    </div>
                </div>
            </main>
            <AppFooter className="border-0 pt-0 pb-5" />
        </div>
    );
}
