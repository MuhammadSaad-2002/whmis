import { type OpenInvoice, oldestFirst, type PartyType } from '@/lib/payment-allocation';
import { useEffect, useState } from 'react';

type State =
    | { key: string; status: 'ready'; invoices: OpenInvoice[]; balance: number }
    | { key: string; status: 'error' };

export function useOpenInvoices(type: PartyType, id: string | number | undefined, revision = 0) {
    const key = id ? `${type}:${id}:${revision}` : '';
    const [result, setResult] = useState<State>();

    useEffect(() => {
        if (!id) return;
        const controller = new AbortController();
        const url = route('lookup.open-invoices', { party_type: type, party_id: id, with_balance: 1 }, false);
        async function fetchInvoices() {
            try {
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error('Could not load invoices');
                const data: { invoices: OpenInvoice[]; balance: number } = await response.json();
                if (!controller.signal.aborted) {
                    setResult({ key, status: 'ready', invoices: oldestFirst(data.invoices), balance: data.balance });
                }
            } catch {
                if (!controller.signal.aborted) setResult({ key, status: 'error' });
            }
        }
        void fetchInvoices();
        return () => controller.abort();
    }, [id, key, type]);

    if (!key) return { status: 'idle' } as const;
    if (result?.key !== key) return { status: 'loading' } as const;
    return result;
}
