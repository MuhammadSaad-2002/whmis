import { money } from '@/lib/format';
import { Check, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Row } from './daily-collections';

export const rs = (paisa: number) => money(paisa / 100);
export const due = (row: Row) => Math.max(0, Math.round(Number(row.outstanding) * 100));
export const reported = (row: Row) => Number(row.reported_paisa);

export function Notice({ tone, children }: { tone: 'red' | 'amber' | 'green' | 'neutral'; children: ReactNode }) {
    const Icon = tone === 'red' ? TriangleAlert : tone === 'green' ? Check : tone === 'amber' ? CircleAlert : Info;
    return <div className="recon-notice" data-tone={tone}><Icon size={17}/><div>{children}</div></div>;
}
