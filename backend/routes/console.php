<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('videos:prune --days=14')->dailyAt('02:00');
