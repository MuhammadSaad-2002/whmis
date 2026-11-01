export interface BookingTimestamps {
    status: string;
    created_at: string | null;
    updated_at: string | null;
    last_edited_at: string | null;
    submitted_at: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    converted_at: string | null;
    cancelled_at: string | null;
}

export function bookingDateTime(value: string | null): string {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(date);
}

export function BookingActivity({ booking }: { booking: BookingTimestamps }) {
    const events: [string, string | null][] = [
        ['Created (first save)', booking.created_at],
        ['Last draft update', booking.last_edited_at],
        ['Submitted', booking.submitted_at],
        [booking.rejected_at || booking.status === 'rejected' ? 'Rejected' : 'Approved',
            booking.rejected_at || booking.approved_at],
        ['Converted to invoice', booking.converted_at],
        ['Cancelled', booking.cancelled_at],
    ];
    return (
        <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Booking activity · Pakistan time (PKT)</summary>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {events.map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd>{bookingDateTime(value)}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Unrecorded or not-yet-reached steps have no timestamp. Last draft update excludes later status changes.</p>
        </details>
    );
}
