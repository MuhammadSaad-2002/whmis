<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ $title }} — {{ $headerLabel }}</title>
    @include('pdf.partials.document-style')
</head>
<body>
    <table class="header"><tr>
        <td>
            @include('pdf.partials.header')
            <h2 class="document-title">{{ $title }}</h2>
        </td>
        <td style="text-align: right;"><h1>{{ $headerLabel }}</h1><div class="meta">{{ $context }}</div></td>
    </tr></table>

    @foreach($notes as $note)<p class="meta">{{ $note }}</p>@endforeach
    @include('pdf.partials.report-table')
</body>
</html>
