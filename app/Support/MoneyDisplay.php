<?php

namespace App\Support;

/** Monetary display only. Does not change the stored or calculated amount. */
final class MoneyDisplay
{
    public static function total(int|float|string|null $value): string
    {
        $formatted = number_format((float) $value, 2);

        return str_ends_with($formatted, '.00') ? substr($formatted, 0, -3) : $formatted;
    }

    public static function roundedTotal(int|float|string|null $value): string
    {
        return self::total(Paisa::rupees(Paisa::roundToRupee(Paisa::from($value ?? 0))));
    }
}
