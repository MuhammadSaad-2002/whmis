<?php

namespace App\Support;

final class ReportCsv
{
    public static function download(string $filename, array $headers, iterable $rows)
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers, ',', '"', '');
            foreach ($rows as $row) {
                fputcsv($out, array_map(static fn ($value) => is_string($value) && ! is_numeric($value) && preg_match('/^[\s]*[=+@-]/u', $value)
                    ? "'".$value : $value, $row), ',', '"', '');
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
