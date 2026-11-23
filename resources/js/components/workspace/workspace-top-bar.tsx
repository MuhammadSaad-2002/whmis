import AppLogoIcon from '@/components/app-logo-icon';
import { NotificationBell } from '@/components/notification-bell';
import { navGroups, superAdminNavGroups } from '@/components/nav-config';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserMenuContent } from '@/components/user-menu-content';
import { useInitials } from '@/hooks/use-initials';
import { usePermissions } from '@/hooks/use-permissions';
import { PRODUCT_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { ChevronDown, Menu } from 'lucide-react';

interface WorkspaceTopBarProps {
    activePath: string;
    home: { url: string; title: string };
    isSuperAdmin: boolean;
    onNavigate: (url: string, title: string) => void;
}

export function WorkspaceTopBar({ activePath, home, isSuperAdmin, onNavigate }: WorkspaceTopBarProps) {
    const { auth } = usePage<SharedData>().props;
    const { can } = usePermissions();
    const initials = useInitials();
    const groups = (isSuperAdmin ? superAdminNavGroups : navGroups).map((group) => ({
        ...group,
        items: group.items.filter((item) => can(item.permission)),
    }));
    const dailyWork = isSuperAdmin ? groups[0] : undefined;
    const isActive = (url: string) => activePath === url || activePath.startsWith(`${url}/`);
    const inMoreMenu = groups.some((group) => group !== dailyWork && group.items.some((item) => isActive(item.url)));

    return (
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground md:px-4">
            <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${PRODUCT_NAME} ${home.title}`}
                onClick={() => onNavigate(home.url, home.title)}
            >
                <AppLogoIcon className="size-8 rounded-lg ring-1 ring-white/15" />
            </button>

            {dailyWork && <nav aria-label="Daily Work" className="hidden min-w-0 flex-1 items-center gap-0.5 pl-2 xl:flex">
                {dailyWork.items.map((item) => (
                    <Button
                        key={item.url}
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-current={isActive(item.url) ? 'page' : undefined}
                        className={cn('shrink-0 gap-1.5 px-2 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground 2xl:text-sm', isActive(item.url) && 'bg-sidebar-accent text-sidebar-accent-foreground')}
                        onClick={() => onNavigate(item.url, item.title)}
                    >
                        {item.icon && <item.icon aria-hidden="true" className="size-4" />}
                        {item.title}
                    </Button>
                ))}
            </nav>}

            <div className="ml-auto flex shrink-0 items-center gap-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Workspace pages"
                            className={cn('gap-1.5 px-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:h-11 max-md:border max-md:border-sidebar-border max-md:px-3', inMoreMenu && 'bg-sidebar-accent text-sidebar-accent-foreground')}
                        >
                            <Menu aria-hidden="true" className="size-4 xl:hidden" />
                            <span className="xl:hidden">Pages</span>
                            <span className="hidden xl:inline">More</span>
                            <ChevronDown aria-hidden="true" className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" collisionPadding={8} className="max-h-[min(75dvh,var(--radix-dropdown-menu-content-available-height))] w-[min(47rem,calc(100vw-1rem))] touch-pan-y overflow-y-auto overscroll-contain p-2">
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {groups.filter((group) => group.items.length > 0).map((group) => (
                                <DropdownMenuGroup key={group.label} className={cn('min-w-0 rounded-md border border-border/60 p-1', group === dailyWork && 'xl:hidden')}>
                                    <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {group.icon && <group.icon aria-hidden="true" className="size-4" />}
                                        {group.label}
                                    </DropdownMenuLabel>
                                    {group.items.map((item) => (
                                        <DropdownMenuItem
                                            key={item.url}
                                            aria-current={isActive(item.url) ? 'page' : undefined}
                                            className={cn('min-h-9 cursor-pointer max-md:min-h-11', isActive(item.url) && 'bg-accent font-medium text-accent-foreground')}
                                            onSelect={() => onNavigate(item.url, item.title)}
                                        >
                                            {item.icon && <item.icon aria-hidden="true" />}
                                            {item.title}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuGroup>
                            ))}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>

                <NotificationBell className="max-md:size-11" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Account menu for ${auth.user.name}`} className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:size-11">
                            <Avatar className="size-8">
                                <AvatarImage src={auth.user.avatar} alt="" />
                                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">{initials(auth.user.name)}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                        <UserMenuContent user={auth.user} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
