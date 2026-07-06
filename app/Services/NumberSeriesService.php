<?php

namespace App\Services;

use App\Models\NumberSeries;
use Illuminate\Support\Facades\DB;

class NumberSeriesService
{
    /**
     * Get the next document number for a series, e.g. "PI-2026-0001".
     * Row-locked so concurrent posts never receive the same number.
     */
    public function next(string $docType): string
    {
        return DB::transaction(function () use ($docType) {
            $series = NumberSeries::where('doc_type', $docType)->lockForUpdate()->firstOrFail();

            $number = $series->next_number;
            $series->update(['next_number' => $number + 1]);

            $parts = [$series->prefix];
            if ($series->yearly) {
                $parts[] = now()->format('Y');
            }
            $parts[] = str_pad((string) $number, $series->padding, '0', STR_PAD_LEFT);

            return implode('-', $parts);
        });
    }
}
