import {
    AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { registerDraftGuard } from '@/lib/embedded';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type SaveDraft = (done: (saved: boolean) => void) => void;

// A redirect with flash.error may still be a successful Inertia visit.
export function draftWasSaved(flash: unknown): boolean {
    return !!flash && typeof flash === 'object' &&
        'success' in flash && typeof flash.success === 'string' && flash.success.length > 0 &&
        !('error' in flash && flash.error);
}

export function useDraftLeave({ version, editable, saving, save }: {
    version: string;
    editable: boolean;
    saving: boolean;
    save: SaveDraft;
}) {
    const baseline = useRef(version);
    const current = useRef({ version, editable, saving });
    const pending = useRef<((approved: boolean) => void) | null>(null);
    const [open, setOpen] = useState(false);

    useLayoutEffect(() => { current.current = { version, editable, saving }; }, [version, editable, saving]);
    useLayoutEffect(() => {
        const unregister = registerDraftGuard({
            dirty: () => current.current.editable && current.current.version !== baseline.current,
            saving: () => current.current.saving,
            ask: () => {
                if (current.current.saving) {
                    toast.info('Wait for the draft to finish saving before leaving.');
                    return Promise.resolve(false);
                }
                if (pending.current) return Promise.resolve(false);
                return new Promise<boolean>((resolve) => {
                    pending.current = resolve;
                    setOpen(true);
                });
            },
        });
        return () => {
            unregister();
            pending.current?.(false);
            pending.current = null;
        };
    }, []);

    useEffect(() => {
        if (!saving && (!editable || version === baseline.current)) return;
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!current.current.saving && (!current.current.editable || current.current.version === baseline.current)) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [version, editable, saving]);

    const finish = (approved: boolean) => {
        const resolve = pending.current;
        pending.current = null;
        setOpen(false);
        resolve?.(approved);
    };

    return {
        markSaved: (savedVersion: string) => { baseline.current = savedVersion; },
        canLeaveAfterSave: () => current.current.version === baseline.current,
        dialog: (
            <AlertDialog open={open} onOpenChange={(next) => { if (!next) finish(false); }}>
                <AlertDialogContent className="max-w-[min(26rem,calc(100%-1.5rem))] rounded-xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
                        <AlertDialogDescription>Save this draft before leaving, or discard only the changes you haven’t saved.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel className="mt-0">Stay</AlertDialogCancel>
                        <Button type="button" variant="outline" onClick={() => finish(true)}>Discard</Button>
                        <Button type="button" onClick={() => { setOpen(false); save(finish); }}>Save Draft</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ),
    };
}
