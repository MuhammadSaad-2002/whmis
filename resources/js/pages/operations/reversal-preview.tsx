import { ReversalImpact, reversalImpactDescription, type ReversalImpactData } from '@/components/reversal-impact';
import { Layout } from './shared';

export default function ReversalPreview({ label, invoices, accounts }: ReversalImpactData) {
    return <Layout title={`Reversal impact · ${label}`} description={reversalImpactDescription}>
        <ReversalImpact invoices={invoices} accounts={accounts} />
    </Layout>;
}
