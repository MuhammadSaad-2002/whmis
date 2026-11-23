import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';

const settingsNavItems: NavItem[] = [
    {
        title: 'Profile',
        url: '/settings/profile',
        icon: null,
    },
    {
        title: 'Password',
        url: '/settings/password',
        icon: null,
    },
    {
        title: 'Appearance',
        url: '/settings/appearance',
        icon: null,
    },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const currentPath = window.location.pathname;

    return (
        <div className="px-4 py-6">
            <Heading title="Settings" description="Manage your profile and account settings" />

            <nav aria-label="Settings" className="mb-6 flex flex-wrap gap-1.5 border-b pb-3">
                {settingsNavItems.map((item) => (
                    <Button
                        key={item.url}
                        size="sm"
                        variant="ghost"
                        asChild
                        className={cn(currentPath === item.url && 'bg-accent text-accent-foreground')}
                    >
                        <Link href={item.url} aria-current={currentPath === item.url ? 'page' : undefined} prefetch>
                            {item.title}
                        </Link>
                    </Button>
                ))}
            </nav>

            <section className="max-w-xl space-y-12">{children}</section>
        </div>
    );
}
