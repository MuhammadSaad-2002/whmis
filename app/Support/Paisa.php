<?php

namespace App\Support;

final class Paisa
{
    public static function from(int|float|string|null $rupees): int
    {
        return (int) round((float) $rupees * 100, 0, PHP_ROUND_HALF_UP);
    }

    public static function rupees(int $paisa): string
    {
        $absolute = abs($paisa);
        return ($paisa < 0 ? '-' : '').intdiv($absolute, 100).'.'.str_pad((string) ($absolute % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Round a final amount to whole rupees, with exactly 50 paisa rounding away from zero. */
    public static function roundToRupee(int $paisa): int
    {
        $rounded = intdiv(abs($paisa) + 50, 100) * 100;

        return $paisa < 0 ? -$rounded : $rounded;
    }
}
