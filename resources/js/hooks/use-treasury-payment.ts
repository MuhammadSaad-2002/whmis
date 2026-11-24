import { usePage } from '@inertiajs/react';

export function useTreasuryPayment() {
    return usePage<{ treasuryPayment?: { required: boolean; accounts: { id: number; name: string; kind: string }[] } }>().props.treasuryPayment ?? { required: false, accounts: [] };
}
