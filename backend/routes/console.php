<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('videos:prune --days=30')->daily();
