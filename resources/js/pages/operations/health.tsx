import { Button } from '@/components/ui/button';
import { router } from '@inertiajs/react';
import { Layout } from './shared';

export default function Health({ checks }: { checks: { name: string; ok: boolean; detail: string }[] }) {
    return <Layout title="System Readiness" description="Read-only checks for deployment and workflow setup." actions={<Button variant="outline" onClick={() => router.reload()}>Recheck</Button>}>
        <div className="space-y-3">{checks.map(check => <article className="rounded-xl border p-4" key={check.name}><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{check.name}</h2><span className={check.ok ? 'text-emerald-700' : 'text-destructive'}>{check.ok ? 'Ready' : 'Needs attention'}</span></div><p className="mt-2 break-words text-sm text-muted-foreground">{check.detail}</p></article>)}</div>
    </Layout>;
}
