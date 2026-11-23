import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { endWorkspaceSession } from '@/hooks/use-tabs';
import { type SharedData, type User } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { LogOut, Settings } from 'lucide-react';

interface UserMenuContentProps {
    user: User;
    onNavigate?: (url: string) => void;
    onLogout?: () => void;
}

export function UserMenuContent({ user, onNavigate, onLogout }: UserMenuContentProps) {
    const cleanup = useMobileNavigation();
    const { auth } = usePage<SharedData>().props;
    const settingsUrl = route(auth.canManageOwnAccount ? 'profile.edit' : 'appearance');
    const settingsLabel = auth.canManageOwnAccount ? 'Settings' : 'Appearance';

    return (
        <>
            <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <UserInfo user={user} showEmail={true} />
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                {onNavigate ? <DropdownMenuItem onSelect={() => onNavigate(settingsUrl)}>
                    <Settings className="mr-2" /> {settingsLabel}
                </DropdownMenuItem> : <DropdownMenuItem asChild>
                    <Link className="block w-full" href={settingsUrl} as="button" prefetch onClick={cleanup}>
                        <Settings className="mr-2" />
                        {settingsLabel}
                    </Link>
                </DropdownMenuItem>}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {onLogout ? <DropdownMenuItem onSelect={onLogout}>
                <LogOut className="mr-2" /> Log out
            </DropdownMenuItem> : <DropdownMenuItem asChild>
                <Link className="block w-full" method="post" href={route('logout')} as="button" onClick={cleanup} onSuccess={endWorkspaceSession}>
                    <LogOut className="mr-2" />
                    Log out
                </Link>
            </DropdownMenuItem>}
        </>
    );
}
