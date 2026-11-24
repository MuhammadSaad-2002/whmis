import { Paginator, type PaginatedData } from '@/components/paginator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDown, ArrowLeftRight, ArrowUp, CheckSquare, Download, Info, Plus, Search, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { selectClass, type Staff } from './shared';
import { TreasuryAccountForm } from './treasury-account-form';
import { TreasuryApprovalLimits } from './treasury-approval-limits';
import { AccountGlyph, Avatar, cash, kindText, KindBadge, PaneCard, type Account } from './treasury-ui';

type Entry = {
    id: number; kind: string; source_type: string; source_id: number; paisa: number; running_paisa: number;
    business_date: string; reference: string | null; actor_id: number | null; actor_name: string | null;
};
type Filters = { search: string; movement: string };
type AccountStats = { opening: number; receipts: number; payouts: number; entries: number; opened: string | null };
type Totals = {
    opening: number; receipts: number; payouts: number; transfers: number; closing: number;
    pending_cash: number | null; pending_bank: number | null; can_reconcile: boolean;
};
type ApprovalQueue = {
    count: number; openings: number;
    items: ApprovalItem[];
    opening_items: ApprovalItem[];
};
type ApprovalItem = { id: number; kind: string; status: string; amount_paisa: number; date: string | null; account: string | null; requester_id: number };
type Props = {
    accounts: Account[]; account: Account | null; entries: PaginatedData<Entry> | null; accountStats: AccountStats | null;
    filters: Filters; control: { go_live_date: string | null; locked_at: string | null; live: boolean };
    staff: Staff[]; salesmen: Staff[]; totals: Totals; approvalQueue: ApprovalQueue | null;
    approvalLimits: Record<string, number | null> | null;
};

const headerButton = 'border-brand-paper/25 bg-brand-paper/10 text-brand-paper hover:bg-brand-paper/20 hover:text-brand-paper';
const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';
const cardHeader = 'flex items-center gap-2 border-b px-4 py-3.5';

export default function Treasury({ accounts, account, entries, accountStats, filters, control, staff, salesmen, totals, approvalQueue, approvalLimits }: Props) {
    const { can } = usePermissions();
    const canManage = can('treasury.manage');
    const locked = !!control.locked_at;
    const [addOpen, setAddOpen] = useState(false);
    const addTrigger = useRef<HTMLButtonElement | null>(null);
    const openAdd = (trigger: HTMLButtonElement) => {
        addTrigger.current = trigger;
        setAddOpen(true);
    };
    const [approvals, setApprovals] = useState<'all' | 'opening' | null>(null);
    const approvalItems = (approvals === 'opening' ? approvalQueue?.opening_items : approvalQueue?.items) ?? [];
    const closeApprovals = useRef<HTMLButtonElement | null>(null);
    const detailRef = useRef<HTMLElement>(null);
    const status = control.live ? 'Live' : locked ? 'Scheduled' : 'Setup required';
    const description = control.live
        ? 'Since ' + shortDate(control.go_live_date) + ' · Balances start from the posted opening of each account'
        : locked ? 'Go-live scheduled for ' + shortDate(control.go_live_date) : 'Prepare and independently approve opening balances before activating Treasury.';

    return <AppLayout><Head title="Cash & Bank" />
        <main className="flex w-full min-w-0 flex-col gap-3.5 px-3 pt-4 pb-10 sm:px-5">
            <header className="brand-panel flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-4 sm:px-6">
                <div className="min-w-0">
                    <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">Cash &amp; Bank</h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-brand-paper/80">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold', control.live ? 'bg-brand-mint/15 text-brand-mint' : 'bg-brand-paper/15 text-brand-paper')}>
                            <span className={cn('size-1.5 rounded-full', control.live ? 'bg-brand-mint ring-2 ring-brand-mint/30' : 'bg-brand-paper/65')} />
                            {status}
                        </span>
                        <span>{description}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {approvalQueue && <Button variant="outline" className={cn(headerButton, 'max-sm:px-2.5')} aria-haspopup="dialog" onClick={(event) => { closeApprovals.current = event.currentTarget; setApprovals('all'); }}>
                        <CheckSquare /> Finance approvals <span className={cn('rounded-md px-1.5 text-xs', approvalQueue.count ? 'bg-brand-mint text-brand-navy' : 'bg-brand-paper/15')}>{approvalQueue.count}</span>
                    </Button>}
                    {canManage && <Button className="bg-brand-mint text-brand-navy hover:bg-brand-mint/85 max-sm:px-2.5" aria-haspopup="dialog" onClick={(event) => openAdd(event.currentTarget)}><Plus /> Add account</Button>}
                </div>
            </header>

            <TreasuryKpis accounts={accounts} totals={totals} />

            {(totals.can_reconcile || approvalQueue) && <div aria-label="Treasury queues" className="flex flex-wrap gap-2">
                {totals.can_reconcile && <>
                    <QueueLink href="/daily-reconciliation" label="Pending cash reports" count={Number(totals.pending_cash ?? 0)} />
                    <QueueLink href="/daily-reconciliation" label="Bank transfers awaiting verification" count={Number(totals.pending_bank ?? 0)} />
                </>}
                {approvalQueue && <button type="button" aria-haspopup="dialog" className={queueClass} onClick={(event) => { closeApprovals.current = event.currentTarget; setApprovals('opening'); }}>
                    <QueueLabel label="Openings awaiting approval" count={approvalQueue.openings} />
                </button>}
            </div>}

            <div className="grid items-start gap-3.5 min-[1201px]:grid-cols-[340px_minmax(0,1fr)]">
                <PaneCard aria-labelledby="treasury-accounts-heading">
                    <div className={cardHeader}><h2 id="treasury-accounts-heading" className="text-base font-bold">Accounts</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{accounts.length}</span></div>
                    <div className="grid gap-2 p-2.5">
                        {accounts.map((item) => <Link key={item.id} href={'/treasury?account=' + item.id} preserveScroll preserveState aria-current={item.id === account?.id ? 'true' : undefined}
                            onSuccess={() => { if (window.matchMedia('(max-width: 1200px)').matches) detailRef.current?.scrollIntoView({ block: 'start' }); }}
                            className={cn('grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:border-ring/60', focusRing, item.id === account?.id && 'border-ring/70 bg-accent/55 ring-2 ring-ring/10')}>
                            <AccountGlyph kind={item.kind} className="row-span-2 size-9" />
                            <span className="min-w-0 break-words text-sm font-bold">{item.name}</span>
                            <span className="text-right text-sm font-bold tabular-nums">{cash(item.balance_paisa)}</span>
                            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"><KindBadge kind={item.kind} /> <span>Opening {cash(item.opening_paisa)}</span></span>
                            <span className="flex justify-end -space-x-1.5">
                                {item.operators.slice(0, 4).map((user) => <Avatar key={user.id} name={user.name} className="size-5 border-2 border-card" />)}
                            </span>
                        </Link>)}
                        {!accounts.length && <p className="px-3 py-5 text-center text-sm text-muted-foreground">No accounts available.</p>}
                        {canManage && <button type="button" aria-haspopup="dialog" onClick={(event) => openAdd(event.currentTarget)} className={cn('flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-input/60 px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-ring hover:bg-accent hover:text-accent-foreground', focusRing)}><Plus className="size-4" /> Add account</button>}
                    </div>
                    <div className="flex justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground"><span>Total across accounts</span><strong className="text-right text-foreground tabular-nums">{cash(totals.closing)}</strong></div>
                </PaneCard>

                <section ref={detailRef} className="min-w-0 scroll-mt-20">
                    {account && accountStats && entries
                        ? <AccountDetail key={account.id} account={account} stats={accountStats} entries={entries} filters={filters} canManage={canManage} locked={locked} staff={staff} salesmen={salesmen} />
                        : <PaneCard className="px-4 py-12 text-center text-sm text-muted-foreground">{accounts.length ? 'Select an account to view its ledger.' : 'Account details and ledger entries will appear here.'}</PaneCard>}
                </section>
            </div>

            {approvalLimits && <TreasuryApprovalLimits key={JSON.stringify(approvalLimits)} limits={approvalLimits} />}

            {canManage && <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent appearance="form" className="max-w-[640px]" onCloseAutoFocus={(event) => { event.preventDefault(); addTrigger.current?.focus(); }}>
                    <DialogHeader>
                        <DialogTitle>Add cash, bank or custody account</DialogTitle>
                        <DialogDescription>{locked ? 'New accounts start at zero after the opening is locked.' : 'The opening balance becomes the first ledger entry when the opening is approved and posted.'}</DialogDescription>
                    </DialogHeader>
                    <TreasuryAccountForm staff={staff} salesmen={salesmen} locked={locked} onCancel={() => setAddOpen(false)} onSaved={() => setAddOpen(false)} modal />
                </DialogContent>
            </Dialog>}

            {approvalQueue && <Sheet open={approvals !== null} onOpenChange={(open) => { if (!open) setApprovals(null); }}>
                <SheetContent className="flex w-full flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-[460px]" onCloseAutoFocus={(event) => { event.preventDefault(); closeApprovals.current?.focus(); }}>
                    <SheetHeader className="border-b px-5 py-5 pr-12 text-left">
                        <SheetTitle>{approvals === 'opening' ? 'Openings awaiting approval' : 'Finance approvals'}</SheetTitle>
                        <SheetDescription>Review pending requests and approved actions ready for posting.</SheetDescription>
                    </SheetHeader>
                    <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-5 py-4">
                        {approvalItems.map((item) => <article key={item.id} className="rounded-xl border px-3.5 py-3 text-sm">
                            <div className="flex flex-wrap justify-between gap-2 font-semibold"><span>{item.account ?? kindText(item.kind)} · #{item.id}</span><span className="tabular-nums">{cash(item.amount_paisa)}</span></div>
                            <p className="mt-1.5 text-muted-foreground">{kindText(item.kind)} · {shortDate(item.date)} · User #{item.requester_id}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{kindText(item.status)}</span><Button size="sm" variant="outline" asChild><Link href={'/finance-approvals?request_id=' + item.id} onClick={() => setApprovals(null)}>Open request</Link></Button></div>
                        </article>)}
                        {!approvalItems.length && <div className="grid justify-items-center gap-1 py-12 text-center text-sm text-muted-foreground"><CheckSquare className="mb-2 size-8 text-accent-foreground" /><strong className="text-foreground">All caught up</strong><p>Nothing is waiting in this queue.</p></div>}
                    </div>
                    <div className="border-t px-5 py-4"><Button variant="outline" className="w-full" asChild><Link href="/finance-approvals" onClick={() => setApprovals(null)}>Open Finance Approvals</Link></Button></div>
                </SheetContent>
            </Sheet>}
        </main>
    </AppLayout>;
}

function TreasuryKpis({ accounts, totals }: { accounts: Account[]; totals: Totals }) {
    const bank = accounts.filter((account) => account.kind === 'bank').reduce((sum, account) => sum + Number(account.balance_paisa), 0);
    const cashBalance = Number(totals.closing) - bank;
    const bankShare = totals.closing > 0 && bank >= 0 && cashBalance >= 0 ? bank / totals.closing : null;
    const kpis = [
        { label: 'Posted opening', value: totals.opening, foot: accounts.length + ' accounts', icon: Plus, tone: 'bg-muted text-muted-foreground' },
        { label: 'Verified receipts', value: totals.receipts, foot: 'Since go-live', icon: ArrowDown, tone: 'bg-accent text-accent-foreground' },
        { label: 'Completed payouts', value: totals.payouts, foot: 'Since go-live', icon: ArrowUp, tone: 'bg-destructive/10 text-destructive' },
        { label: 'Transfers sent', value: totals.transfers, foot: 'Between own accounts', icon: ArrowLeftRight, tone: 'bg-chart-1/10 text-chart-1' },
    ];
    return <section aria-label="Treasury summary" className="grid grid-cols-2 gap-2.5 sm:gap-3.5 min-[701px]:max-[1201px]:grid-cols-3 min-[1201px]:grid-cols-5">
        {kpis.map(({ label, value, foot, icon: Icon, tone }) => <PaneCard key={label} className="flex items-start gap-2 p-3 sm:gap-3 sm:px-4 sm:py-3.5">
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg sm:size-9', tone)}><Icon className="size-4" /></span>
            <div className="min-w-0"><p className="text-sm leading-snug font-medium text-muted-foreground">{label}</p>
                <p className="mt-0.5 break-words text-lg leading-tight font-bold tracking-tight tabular-nums sm:text-xl">{cash(value)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{foot}</p></div>
        </PaneCard>)}
        <PaneCard className="brand-panel col-span-2 flex items-start gap-3 border-transparent p-3 text-brand-paper sm:col-span-1 sm:px-4 sm:py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-paper/15 text-brand-mint"><Wallet className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium text-brand-paper/85">Current balance</p>
                <p className="mt-0.5 break-words text-xl leading-tight font-bold tracking-tight tabular-nums">{cash(totals.closing)}</p>
                <p className="mt-1 text-xs text-brand-paper/80">Bank {cash(bank)} · Cash {cash(cashBalance)}</p>
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-brand-paper/20" aria-hidden="true">{bankShare !== null && <><span className="bg-brand-paper/65" style={{ width: (bankShare * 100) + '%' }} /><span className="flex-1 bg-brand-mint" /></>}</div></div>
        </PaneCard>
    </section>;
}

const queueClass = cn('inline-flex min-h-9 items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground', focusRing);
function QueueLink({ href, ...props }: { href: string; label: string; count: number }) {
    return <Link href={href} className={queueClass}><QueueLabel {...props} /></Link>;
}
function QueueLabel({ label, count }: { label: string; count: number }) {
    return <><span className={cn('size-2 shrink-0 rounded-full', count ? 'bg-chart-4' : 'bg-chart-2')} />
        <span>{label}</span><strong className={cn('rounded-md px-1.5 text-xs leading-5 tabular-nums', count ? 'bg-chart-4/10 text-chart-4' : 'bg-muted text-foreground')}>{count}</strong></>;
}

function AccountDetail({ account, stats, entries, filters, canManage, locked, staff, salesmen }: {
    account: Account; stats: AccountStats; entries: PaginatedData<Entry>; filters: Filters;
    canManage: boolean; locked: boolean; staff: Staff[]; salesmen: Staff[];
}) {
    return <PaneCard aria-labelledby="treasury-account-title">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-[18px]">
            <AccountGlyph kind={account.kind} className="size-11 [&_svg]:size-5" />
            <div className="min-w-0 flex-1">
                <h2 id="treasury-account-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold tracking-tight sm:text-xl">{account.name} <KindBadge kind={account.kind} /></h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{account.operators.length} {account.operators.length === 1 ? 'operator' : 'operators'}{stats.opened ? ' · Opened ' + shortDate(stats.opened) : ' · Opening not posted'}</p>
            </div>
            <div className="text-right"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Balance</p><p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{cash(account.balance_paisa)}</p></div>
        </div>
        <dl className="grid grid-cols-2 border-b min-[1201px]:grid-cols-4">
            {[
                { label: 'Opening', value: cash(stats.opening) },
                { label: 'Receipts', value: cash(stats.receipts), tone: 'text-chart-2' },
                { label: 'Payouts', value: cash(stats.payouts), tone: 'text-destructive' },
                { label: 'Entries', value: stats.entries.toLocaleString('en-PK') },
            ].map(({ label, value, tone }, index) => <div key={label} className={cn('min-w-0 px-4 py-2.5', index < 2 && 'max-[1201px]:border-b', index % 2 === 0 && 'border-r', index === 1 && 'min-[1201px]:border-r')}>
                <dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn('text-base font-bold tabular-nums', tone)}>{value}</dd>
            </div>)}
        </dl>
        <Tabs defaultValue="ledger">
            <TabsList aria-label="Account views" className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent px-3 py-0">
                {['Ledger', ...(canManage ? ['Settings & operators'] : [])].map((label, index) => <TabsTrigger key={label} value={index === 0 ? 'ledger' : 'settings'} className="min-h-11 rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-semibold data-[state=active]:border-ring data-[state=active]:bg-transparent data-[state=active]:shadow-none">{label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="ledger" className="mt-0 min-w-0 p-3 sm:p-4"><Ledger accountId={account.id} entries={entries} filters={filters} onlyOpening={stats.entries === 1 && !!stats.opened} /></TabsContent>
            {canManage && <TabsContent value="settings" className="mt-0 p-3 sm:p-4"><TreasuryAccountForm key={JSON.stringify(account)} account={account} locked={locked} staff={staff} salesmen={salesmen} /></TabsContent>}
        </Tabs>
    </PaneCard>;
}

function Ledger({ accountId, entries, filters, onlyOpening }: { accountId: number; entries: PaginatedData<Entry>; filters: Filters; onlyOpening: boolean }) {
    const [search, setSearch] = useState(filters.search);
    const [movement, setMovement] = useState(filters.movement);
    const filterTerm = search.trim();
    useEffect(() => {
        if (filterTerm === filters.search && movement === filters.movement) return;
        const timeout = window.setTimeout(() => {
            router.get('/treasury', { account: accountId, ...(filterTerm ? { search: filterTerm } : {}), ...(movement ? { movement } : {}) },
                { preserveState: true, preserveScroll: true, replace: true, only: ['entries', 'filters', 'account', 'accountStats'] });
        }, 280);
        return () => window.clearTimeout(timeout);
    }, [accountId, filterTerm, movement, filters.search, filters.movement]);
    const hasFilters = Boolean(filters.search || filters.movement);

    return <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-40 flex-1 sm:max-w-[300px]"><span className="sr-only">Search reference</span><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" className="h-10 pl-9 text-base placeholder:text-muted-foreground sm:text-sm" placeholder="Search reference…" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select aria-label="Filter ledger movements" className={cn(selectClass, 'w-auto max-w-full')} value={movement} onChange={(event) => setMovement(event.target.value)}>
                <option value="">All movements</option><option value="opening">Opening</option><option value="receipt">Receipt</option><option value="payout">Payout</option><option value="transfer">Transfer</option><option value="other">Adjustment</option>
            </select>
            <Button variant="outline" className="ml-auto min-h-10" asChild><a href={'/treasury/accounts/' + accountId + '/csv'}><Download /> Export CSV</a></Button>
        </div>
        <div tabIndex={0} aria-label="Account ledger table" className="max-w-full overflow-x-auto rounded-xl border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <table className="w-full min-w-[730px] text-left text-sm">
                <thead className="bg-muted/65 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><tr>
                    {['Date', 'Movement', 'Reference', 'Status', 'Receipt / payout', 'Running balance', 'Actor'].map((label, index) => <th scope="col" key={label} className={cn('px-3 py-2.5 whitespace-nowrap', [4, 5].includes(index) && 'text-right')}>{label}</th>)}
                </tr></thead>
                <tbody>{entries.data.map((entry) => <tr key={entry.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2.5 whitespace-nowrap">{shortDate(entry.business_date)}</td>
                    <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', movementTone(entry.kind))}>{kindText(entry.kind)}</span></td>
                    <td className="max-w-72 px-3 py-2.5 break-words text-muted-foreground">{entry.reference ?? kindText(entry.source_type) + ' #' + entry.source_id}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Posted</span></td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums', Number(entry.paisa) < 0 && 'text-destructive')}>{cash(entry.paisa)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{cash(entry.running_paisa)}</td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-1.5 whitespace-nowrap">{entry.actor_name && <Avatar name={entry.actor_name} className="size-5" />}{entry.actor_name ?? (entry.actor_id ? 'User #' + entry.actor_id : '—')}</div></td>
                </tr>)}
                {!entries.data.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{hasFilters ? 'No entries match these filters.' : 'No ledger entries have been posted.'}</td></tr>}</tbody>
            </table>
        </div>
        {entries.last_page > 1 && <div className="overflow-x-auto"><Paginator meta={entries} /></div>}
        {onlyOpening && !hasFilters && <p className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Only the opening entry so far. Receipts, payouts, and transfers will appear here with a running balance.</p>}
    </div>;
}

function movementTone(kind: string) {
    if (kind.includes('transfer')) return 'bg-chart-1/10 text-chart-1';
    if (['receipt', 'refund_recovery', 'shortage_repayment', 'recovery_repayment', 'advance_repayment'].includes(kind)) return 'bg-accent text-accent-foreground';
    if (['supplier_payment', 'customer_refund', 'commission_payout', 'advance', 'salary_payment', 'expense'].includes(kind)) return 'bg-destructive/10 text-destructive';
    return 'bg-muted text-muted-foreground';
}
