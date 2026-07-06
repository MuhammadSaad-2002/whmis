import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { router } from '@inertiajs/react';
import { Bell, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface NotificationRow {
    id: string;
    type: string;
    title: string;
    message: string;
    url: string | null;
    read: boolean;
    created_at: string;
}

export function NotificationBell() {
    const [unread, setUnread] = useState(0);
    const [notifications, setNotifications] = useState<NotificationRow[]>([]);

    const load = useCallback(async () => {
        try {
            const response = await fetch('/notifications', { headers: { Accept: 'application/json' } });
            if (!response.ok) return;
            const data = await response.json();
            setUnread(data.unread_count);
            setNotifications(data.notifications);
        } catch {
            /* offline */
        }
    }, []);

    useEffect(() => {
        void load();
        const interval = setInterval(() => void load(), 60_000);
        return () => clearInterval(interval);
    }, [load]);

    const csrf = () => {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    };

    const markRead = async (id: string) => {
        await fetch(`/notifications/${id}/read`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': csrf() },
        });
        void load();
    };

    const markAllRead = async () => {
        await fetch('/notifications/read-all', {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': csrf() },
        });
        void load();
    };

    const open = (notification: NotificationRow) => {
        if (!notification.read) void markRead(notification.id);
        if (notification.url) router.visit(notification.url);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="size-5" />
                    {unread > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
                            {unread > 9 ? '9+' : unread}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-sm font-semibold">Notifications</span>
                    {unread > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void markAllRead()}>
                            <CheckCheck className="mr-1 size-3.5" /> Mark all read
                        </Button>
                    )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 && (
                        <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications.</p>
                    )}
                    {notifications.map((notification) => (
                        <button
                            key={notification.id}
                            type="button"
                            onClick={() => open(notification)}
                            className={`block w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50 ${
                                notification.read ? 'opacity-60' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                    {!notification.read && <span className="mr-1.5 inline-block size-2 rounded-full bg-primary" />}
                                    {notification.title}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">{notification.created_at}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                        </button>
                    ))}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
