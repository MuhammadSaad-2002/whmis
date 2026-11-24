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
}
