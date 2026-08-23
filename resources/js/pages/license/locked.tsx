import { Button } from '@/components/ui/button';
import { Head, router } from '@inertiajs/react';
import { LockKeyhole } from 'lucide-react';

// Full-screen "system inactive" screen shown to every gated user (all roles
// except Super Admin) once the license has expired or was never activated.
// Deliberately standalone — it does NOT use AppLayout (which would bounce the
// document into the tabbed workspace, itself gated → a redirect loop).
export default function LicenseLocked() {
    const logout = () => router.post(route('logout'));

    return (
        <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
            <Head title="System inactive" />
            <div className="w-full max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <LockKeyhole className="size-7" />
                </div>
                <h1 className="text-2xl font-bold">System access is inactive</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    Your access to the system has been deactivated. Please contact your system
                    administrator to reactivate the system.
                </p>
                <Button variant="outline" className="mt-6 w-full" onClick={logout}>
                    Log out
                </Button>
            </div>
        </div>
    );
}
