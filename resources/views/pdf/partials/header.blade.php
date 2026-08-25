{{-- Per-deployment letterhead. Content comes from config/branding.php (← .env),
     so the same template prints a different header for each client. --}}
@php
    $brandLogo = config('branding.logo');
    $brandLine2 = collect([
        config('branding.address'),
        config('branding.phone') ? 'Phone: '.config('branding.phone') : null,
        config('branding.ntn') ? 'NTN: '.config('branding.ntn') : null,
    ])->filter()->implode(' · ');
@endphp
@if($brandLogo && file_exists(public_path($brandLogo)))
    <img src="{{ public_path($brandLogo) }}" alt="" style="max-height:42px; margin-bottom:4px;">
@endif
<h1>{{ config('branding.company') }}</h1>
@if($brandLine2)
    <div class="meta">{{ $brandLine2 }}</div>
@endif
