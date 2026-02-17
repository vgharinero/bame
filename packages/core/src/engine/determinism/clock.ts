export interface TurnTimerConfig {
	maxTurnDurationMs: number | null;
	warningThresholdMs?: number;
	autoEndTurnOnExpire?: boolean;
}

export interface TurnTimer {
	turnStartedAt: number;
	pausedAt?: number;
	accumulatedTimeMs?: number;
}

export const isTurnExpired = (
	timer: TurnTimer,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): boolean => {
	if (config.maxTurnDurationMs === null) {
		return false;
	}

	const elapsed = getElapsedTimeMs(timer, currentTimestamp);
	return elapsed >= config.maxTurnDurationMs;
};

export const getRemainingTimeMs = (
	timer: TurnTimer,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): number | null => {
	if (config.maxTurnDurationMs === null) {
		return null;
	}

	const elapsed = getElapsedTimeMs(timer, currentTimestamp);
	const remaining = config.maxTurnDurationMs - elapsed;
	return Math.max(0, remaining);
};

export const getElapsedTimeMs = (
	timer: TurnTimer,
	currentTimestamp: number = Date.now(),
): number => {
	const accumulated = timer.accumulatedTimeMs ?? 0;

	if (timer.pausedAt !== undefined) {
		// Turn is paused, return accumulated time only
		return accumulated;
	}

	// Turn is active, add time since start
	const activeDuration = currentTimestamp - timer.turnStartedAt;
	return accumulated + activeDuration;
};

export const isInWarningThreshold = (
	timer: TurnTimer,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): boolean => {
	if (!config.warningThresholdMs || config.maxTurnDurationMs === null) {
		return false;
	}

	const remaining = getRemainingTimeMs(timer, config, currentTimestamp);
	if (remaining === null) {
		return false;
	}

	return remaining <= config.warningThresholdMs && remaining > 0;
};

export const startTurnTimer = (
	currentTimestamp: number = Date.now(),
): TurnTimer => ({
	turnStartedAt: currentTimestamp,
	accumulatedTimeMs: 0,
});

export const pauseTurnTimer = (
	timer: TurnTimer,
	currentTimestamp: number = Date.now(),
): TurnTimer => {
	if (timer.pausedAt !== undefined) {
		return timer; // Already paused
	}

	const accumulated =
		(timer.accumulatedTimeMs ?? 0) +
		(currentTimestamp - timer.turnStartedAt);

	return {
		...timer,
		pausedAt: currentTimestamp,
		accumulatedTimeMs: accumulated,
	};
};

export const resumeTurnTimer = (
	timer: TurnTimer,
	currentTimestamp: number = Date.now(),
): TurnTimer => {
	if (timer.pausedAt === undefined) {
		return timer; // Not paused
	}

	return {
		turnStartedAt: currentTimestamp,
		accumulatedTimeMs: timer.accumulatedTimeMs ?? 0,
		pausedAt: undefined,
	};
};
