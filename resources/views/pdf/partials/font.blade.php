@foreach(['normal' => [400 => 'Regular', 700 => 'Bold'], 'italic' => [400 => 'Italic', 700 => 'BoldItalic']] as $style => $weights)
    @foreach($weights as $weight => $face)
        @font-face {
            font-family: 'Instrument Sans';
            src: url("file://{{ public_path("fonts/instrument-sans/InstrumentSans-{$face}.ttf") }}") format('truetype');
            font-weight: {{ $weight }};
            font-style: {{ $style }};
        }
    @endforeach
@endforeach
