<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Packer;
use Illuminate\Http\JsonResponse;

class PackerController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Packer::query()
                ->where('active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name', 'station']),
        );
    }
}
