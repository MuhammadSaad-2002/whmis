import AppLayout from '@/layouts/app-layout';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { CollectionTitle, FollowUpPanel, type CollectionDetail } from './collection-follow-up';
import './collections.css';

export default function Collection(props: CollectionDetail) {
    const { invoice, today } = props;
    return <AppLayout>
        <Head title={`Collection · ${invoice.invoice_number}`} />
        <main className="collections-theme collections-page">
            <Link className="btn" href={route('collections.index', {}, false)}><ArrowLeft className="i" aria-hidden="true" />Worklist</Link>
            <article className="flat collection-detail">
                <CollectionTitle number={invoice.invoice_number} customer={invoice.customer} due={invoice.due_on} today={today} />
                <FollowUpPanel {...props} />
            </article>
        </main>
    </AppLayout>;
}
