<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\AuditReferenceResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;

class AuditController extends Controller
{
    public function index(Request $request)
    {
        /** @var class-string<\Illuminate\Database\Eloquent\Model> $auditModel */
        $auditModel = config('audit.implementation', \OwenIt\Auditing\Models\Audit::class);

        $audits = $auditModel::query()
            ->with('user:id,name,email')
            ->when($request->user_id, fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->event, fn ($q, $event) => $q->where('event', $event))
            ->when($request->model, fn ($q, $type) => $q->where('auditable_type', $type))
            ->when($request->from, fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($request->to, fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->when($request->search, function ($q, $search) {
                $q->where(fn ($w) => $w
                    ->where('url', 'like', "%{$search}%")
                    ->orWhere('tags', 'like', "%{$search}%")
                    ->orWhere('old_values', 'like', "%{$search}%")
                    ->orWhere('new_values', 'like', "%{$search}%"));
            })
            ->latest()
            ->paginate(25)
            ->withQueryString();

        // Resolve reference ids (customer_id, created_by, …) to names, batch-loaded
        // once from this page's rows so the diff reads in plain language.
        $resolver = new AuditReferenceResolver($audits->getCollection());

        $audits->through(fn ($audit) => [
            'id' => $audit->id,
            'event' => $audit->event,
            'user' => $audit->user ? ['name' => $audit->user->name, 'email' => $audit->user->email] : null,
            'auditable_type' => $audit->auditable_type,
            'auditable_label' => $this->label($audit->auditable_type),
            'auditable_id' => $audit->auditable_id,
            'old_values' => $resolver->apply($audit->old_values),
            'new_values' => $resolver->apply($audit->new_values),
            'ip_address' => $audit->ip_address,
            'url' => $audit->url,
            'tags' => $audit->tags,
            'created_at' => $audit->created_at?->toDateTimeString(),
        ]);

        return Inertia::render('admin/audit/index', [
            'audits' => $audits,
            'filters' => $request->only('user_id', 'event', 'model', 'from', 'to', 'search'),
            'users' => User::orderBy('name')->get(['id', 'name']),
            'events' => $auditModel::query()->distinct()->orderBy('event')->pluck('event'),
            'models' => $this->modelOptions($auditModel),
        ]);
    }

    /** Friendly name for a morph alias, e.g. "sales_invoice" → "Sales Invoice". */
    private function label(?string $type): ?string
    {
        return $type ? Str::of($type)->replace('_', ' ')->title()->value() : null;
    }

    /**
     * Distinct auditable types present, as {value,label} options.
     *
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $auditModel
     * @return array<int, array{value: string, label: string}>
     */
    private function modelOptions(string $auditModel): array
    {
        return $auditModel::query()
            ->whereNotNull('auditable_type')
            ->distinct()
            ->orderBy('auditable_type')
            ->pluck('auditable_type')
            ->map(fn ($type) => ['value' => $type, 'label' => $this->label($type)])
            ->all();
    }
}
