<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('branding.product_name', 'Tradentra') }}</title>
        <meta name="application-name" content="{{ config('branding.product_name', 'Tradentra') }}">
        <meta name="description" content="{{ config('branding.product_tagline', 'The Complete Business Management Platform') }}">
        <link rel="icon" type="image/svg+xml" href="{{ asset('branding/tradentra-mark.svg') }}">

        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
