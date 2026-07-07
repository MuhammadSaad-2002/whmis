<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Warehouse;
use App\Services\BookingService;
use App\Services\MarginCalculator;
use App\Services\NumberSeriesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use RuntimeException;

class BookingController extends Controller
{
    public function __construct(
        private readonly NumberSeriesService $numbers,
        private readonly BookingService $bookings,
    ) {}

    /** Bookers see only their own bookings; approvers see all. */
    private function scoped(Request $request)
    {
        return Booking::query()->when(
            ! $request->user()->can('bookings.approve'),
            fn ($q) => $q->where('booker_id', $request->user()->id),
        );
    }

    public function index(Request $request)
    {
        $bookings = $this->scoped($request)
            ->with(['customer:id,name,city', 'booker:id,name'])
            ->when($request->search, fn ($q, $search) => $q->where('booking_number', 'like', "%{$search}%"))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->latest('booking_date')->latest('id')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('bookings/index', [
            'bookings' => $bookings,
            'customers' => Customer::active()->orderBy('name')->get(['id', 'name']),
            'filters' => $request->only('search', 'status', 'customer_id'),
        ]);
    }

    public function create(Request $request)
    {
        return Inertia::render('bookings/form', [
            'customers' => $this->customerOptions($request),
            'warehouse' => Warehouse::default()->only(['id', 'name']),
            'booking' => null,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        $booking = DB::transaction(function () use ($request, $data) {
            $booking = Booking::create($this->headerAttributes($data) + [
                'booking_number' => $this->numbers->next('booking'),
                'booker_id' => $request->user()->id,
                'status' => Booking::STATUS_DRAFT,
                'created_by' => $request->user()->id,
            ]);
            $this->syncItems($booking, $data['items']);

            return $booking;
        });

        return redirect()
            ->route('bookings.edit', $booking)
            ->with('success', "Booking {$booking->booking_number} saved as draft.");
    }

    public function edit(Request $request, Booking $booking)
    {
        $this->authorizeView($request, $booking);

        $booking->load(['items.product:id,name,generic_name', 'items.appliedRule:id,name', 'customer:id,name,city', 'booker:id,name', 'approver:id,name']);

        return Inertia::render('bookings/form', [
            'customers' => $this->customerOptions($request),
            'warehouse' => $booking->warehouse->only(['id', 'name']),
            'booking' => $booking,
        ]);
    }

    public function update(Request $request, Booking $booking)
    {
        $this->authorizeView($request, $booking);

        if (! $booking->isDraft()) {
            return back()->with('error', 'Only draft bookings can be edited.');
        }

        $data = $this->validated($request);

        if ($name = $this->duplicateProductName($data['items'])) {
            return back()->with('error', "{$name} appears on more than one line — combine it into a single line.");
        }

        DB::transaction(function () use ($booking, $data) {
            $booking->update($this->headerAttributes($data));
            $booking->items()->delete();
            $this->syncItems($booking, $data['items']);
        });

        return back()->with('success', 'Booking updated.');
    }

    public function submit(Request $request, Booking $booking)
    {
        $this->authorizeView($request, $booking);

        if (! $booking->isDraft()) {
            return back()->with('error', 'Only draft bookings can be submitted.');
        }
        if ($booking->items()->count() === 0) {
            return back()->with('error', 'Add at least one item before submitting.');
        }

        $booking->update(['status' => Booking::STATUS_PENDING]);

        app(\App\Services\AlertService::class)->send('bookings.approve', new \App\Notifications\SystemAlert(
            'booking_pending',
            'Booking awaiting approval',
            "{$booking->booking_number} for {$booking->customer->name} by {$request->user()->name}.",
            "/bookings/{$booking->id}",
            "booking:{$booking->id}",
        ));

        return back()->with('success', "Booking {$booking->booking_number} submitted for approval.");
    }

    public function approve(Booking $booking)
    {
        if ($booking->status !== Booking::STATUS_PENDING) {
            return back()->with('error', 'Only pending bookings can be approved.');
        }

        $booking->update([
            'status' => Booking::STATUS_APPROVED,
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        return back()->with('success', "Booking {$booking->booking_number} approved.");
    }

    public function reject(Booking $booking)
    {
        if ($booking->status !== Booking::STATUS_PENDING) {
            return back()->with('error', 'Only pending bookings can be rejected.');
        }

        $booking->update([
            'status' => Booking::STATUS_REJECTED,
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        return back()->with('success', "Booking {$booking->booking_number} rejected.");
    }

    public function cancel(Request $request, Booking $booking)
    {
        $this->authorizeView($request, $booking);

        if (in_array($booking->status, [Booking::STATUS_CONVERTED, Booking::STATUS_CANCELLED])) {
            return back()->with('error', 'This booking can no longer be cancelled.');
        }

        $booking->update(['status' => Booking::STATUS_CANCELLED]);

        return back()->with('success', "Booking {$booking->booking_number} cancelled.");
    }

    public function convert(Booking $booking)
    {
        try {
            $invoice = $this->bookings->convertToSale($booking);
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()
            ->route('sales.edit', $invoice)
            ->with('success', "Booking converted to draft invoice {$invoice->invoice_number}. Review and post it.");
    }

    private function authorizeView(Request $request, Booking $booking): void
    {
        if (! $request->user()->can('bookings.approve') && $booking->booker_id !== $request->user()->id) {
            abort(403);
        }
    }

    private function customerOptions(Request $request)
    {
        // Bookers only book for their assigned pharmacies (if any are assigned).
        return Customer::active()
            ->when(
                ! $request->user()->can('bookings.approve')
                    && Customer::where('booker_id', $request->user()->id)->exists(),
                fn ($q) => $q->where('booker_id', $request->user()->id),
            )
            ->orderBy('name')
            ->get(['id', 'name', 'city']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'warehouse_id' => ['required', 'exists:warehouses,id'],
            'booking_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:1'],
            'items.*.requested_bonus' => ['nullable', 'numeric', 'min:0'],
            'items.*.applied_rule_id' => ['nullable', 'exists:incentive_rules,id'],
            'items.*.trade_price' => ['required', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.gst_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.remarks' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function headerAttributes(array $data): array
    {
        return collect($data)->only(['customer_id', 'warehouse_id', 'booking_date', 'notes'])->all();
    }

    /** Name of the first product that appears on more than one line, or null. */
    private function duplicateProductName(array $items): ?string
    {
        foreach (array_count_values(array_column($items, 'product_id')) as $id => $count) {
            if ($count > 1) {
                return Product::whereKey($id)->value('name') ?? "Product #{$id}";
            }
        }

        return null;
    }

    private function syncItems(Booking $booking, array $items): void
    {
        $payload = array_map(fn ($item) => [
            'product_id' => $item['product_id'],
            'quantity' => $item['quantity'],
            'requested_bonus' => $item['requested_bonus'] ?? 0,
            'applied_rule_id' => $item['applied_rule_id'] ?? null,
            'trade_price' => $item['trade_price'],
            'discount_percent' => $item['discount_percent'] ?? 0,
            'gst_percent' => $item['gst_percent'] ?? 0,
            'remarks' => $item['remarks'] ?? null,
        ], array_values($items));

        $computed = MarginCalculator::computeSalesItems($payload, ['discount_percent' => 0, 'gst_percent' => 0]);

        foreach ($computed['items'] as $item) {
            $booking->items()->create($item);
        }

        $booking->update([
            'subtotal' => $computed['totals']['subtotal'],
            'item_discount_total' => $computed['totals']['item_discount_total'],
            'item_gst_total' => $computed['totals']['item_gst_total'],
            'total_amount' => $computed['totals']['total_amount'],
        ]);
    }
}
