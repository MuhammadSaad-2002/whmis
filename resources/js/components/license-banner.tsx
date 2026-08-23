import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { AlertTriangle } from 'lucide-react';

// Amber "renew soon" banner shown on every page for the last 5 days before
// expiry. The server decides who sees it (Admin users only, never Super Admin)
// via `license.show_warning`, so this component just renders the shared flag.
export function LicenseBanner() {
    const license = usePage<SharedData>().props.license;
    if (!license?.show_warning) return null;

    const days = license.days_remaining ?? 0;
    const when = days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;

    return (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
                System access expires <span className="font-semibold">{when}</span>. Please contact your administrator to renew.
            </span>
        </div>
    );
}
