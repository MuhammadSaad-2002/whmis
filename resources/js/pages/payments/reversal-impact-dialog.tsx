import { ReversalImpact, reversalImpactDescription, type ReversalImpactData } from '@/components/reversal-impact';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';

type PreviewState = { status: 'loading' | 'error' } | { status: 'ready'; data: ReversalImpactData };

function ReceiptImpact({ id }: { id: number }) {
    const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });

    useEffect(() => {
        const request = new AbortController();

        async function load() {
            try {
                const response = await fetch(`/finance-reversals/receipt/${id}`, {
                    cache: 'no-store',
                    headers: { Accept: 'application/json' },
                    signal: request.signal,
                });
                if (!response.ok) throw new Error(`Preview unavailable (${response.status})`);
                const data: ReversalImpactData = await response.json();
                if (!request.signal.aborted) setPreview({ status: 'ready', data });
            } catch {
                if (!request.signal.aborted) setPreview({ status: 'error' });
            }
        }

        void load();
        return () => request.abort();
    }, [id]);

    if (preview.status === 'ready') return <ReversalImpact {...preview.data} />;
    if (preview.status === 'error') return <p role="alert" className="text-sm text-destructive">Could not load the reversal impact. Close and reopen this preview to try again.</p>;

    return <p role="status" className="text-sm text-muted-foreground">Loading reversal impact…</p>;
}

export function ReceiptReversalImpactDialog({ id, number }: { id: number; number: string }) {
    return <Dialog>
        <DialogTrigger asChild>
            <button className="ib" type="button" title="Reversal impact" aria-label={`Reversal impact for ${number}`}>
                <Info className="i" aria-hidden="true" />
            </button>
        </DialogTrigger>
        <DialogContent appearance="form" className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Reversal impact · {number}</DialogTitle>
                <DialogDescription>{reversalImpactDescription}</DialogDescription>
            </DialogHeader>
            <DialogBody><ReceiptImpact id={id} /></DialogBody>
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Close</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}
