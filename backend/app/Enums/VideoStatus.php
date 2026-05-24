<?php

namespace App\Enums;

enum VideoStatus: string
{
    case PendingUpload = 'pending_upload';
    case UploadedRaw   = 'uploaded_raw';
    case Compressing   = 'compressing';
    case Available     = 'available';
    case Failed        = 'failed';

    /** Human-friendly label for the CS Dashboard. */
    public function label(): string
    {
        return match ($this) {
            self::PendingUpload => 'Pending Upload',
            self::UploadedRaw   => 'Uploaded (raw)',
            self::Compressing   => 'Compressing',
            self::Available     => 'Available',
            self::Failed        => 'Failed',
        };
    }
}
