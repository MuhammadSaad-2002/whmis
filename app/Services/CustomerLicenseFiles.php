<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class CustomerLicenseFiles
{
    public function saveCustomer(array $attributes, ?Customer $customer, ?UploadedFile $file): Customer
    {
        if (! $file) {
            if (! $customer) {
                return Customer::create($attributes);
            }
            $customer->update($attributes);

            return $customer;
        }

        $path = $file->store('customer-licenses', 'local');
        if (! $path) {
            throw ValidationException::withMessages(['drug_license_file' => 'Could not save the file. Please try uploading it again.']);
        }

        try {
            [$saved, $previous] = DB::transaction(function () use ($attributes, $customer, $path): array {
                $record = $customer ? Customer::query()->lockForUpdate()->findOrFail($customer->id) : new Customer;
                $previous = $record->drug_license_path;
                $record->fill($attributes);
                $record->drug_license_path = $path;
                $record->save();

                return [$record, $previous];
            });
        } catch (Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        if ($previous && $previous !== $path) {
            Storage::disk('local')->delete($previous);
        }

        return $saved;
    }

    public function download(Customer $customer): StreamedResponse
    {
        $path = $customer->drug_license_path;
        $disk = Storage::disk('local');
        abort_unless($path && $disk->exists($path), 404);

        $extension = pathinfo($path, PATHINFO_EXTENSION);

        return $disk->download($path, "customer-{$customer->id}-licence.{$extension}", [
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
