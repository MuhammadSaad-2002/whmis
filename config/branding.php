<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Document branding (PDF header & footer)
    |--------------------------------------------------------------------------
    |
    | Per-deployment letterhead used on every printed invoice/report. These are
    | driven entirely from .env so the SAME codebase prints a different header
    | and footer for each client — set them on each server, then run
    | `php artisan config:cache`. Nothing here should be hardcoded per client.
    |
    */

    'company' => env('BRANDING_COMPANY', 'MP Sub Office'),
    'address' => env('BRANDING_ADDRESS', ''),
    'phone' => env('BRANDING_PHONE', ''),
    'ntn' => env('BRANDING_NTN', ''),

    // Optional logo: path relative to public/ (e.g. "branding/logo.png"). Left blank = no logo.
    'logo' => env('BRANDING_LOGO', ''),

    // Credit line shown at the bottom-left of every page footer.
    'footer' => env('BRANDING_FOOTER', 'Developed by Virtual Wisdom Technologies'),
];
