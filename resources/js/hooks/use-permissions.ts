import { usePage } from '@inertiajs/react';

interface AuthProps {
    auth: { permissions?: string[]; roles?: string[] };
    [key: string]: unknown;
}

export function usePermissions() {
    const { auth } = usePage<AuthProps>().props;
    const permissions = auth?.permissions ?? [];

    return {
        can: (permission: string) => permissions.includes(permission),
        canAny: (...list: string[]) => list.some((p) => permissions.includes(p)),
        roles: auth?.roles ?? [],
    };
}
