import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { toast, Toaster } from 'sonner';

interface FlashProps {
    flash?: { success?: string | null; error?: string | null };
    [key: string]: unknown;
}

export function FlashToaster() {
    const { flash } = usePage<FlashProps>().props;
    const lastShown = useRef<string | null>(null);

    useEffect(() => {
        const key = `${flash?.success ?? ''}|${flash?.error ?? ''}|${Date.now()}`;
        if (!flash?.success && !flash?.error) return;
        if (lastShown.current === key) return;
        lastShown.current = key;
        if (flash.success) toast.success(flash.success);
        if (flash.error) toast.error(flash.error);
    }, [flash]);

    return <Toaster position="top-right" richColors closeButton />;
}
