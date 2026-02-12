export interface TurnTimerConfig {
	maxTurnDurationMs: number | null;
	warningThresholdMs?: number;
	autoEndTurnOnExpire?: boolean;
}

export interface TurnTimerState {
	turnStartedAt: number;
	pausedAt?: number;
	accumulatedTimeMs?: number;
}

export const isTurnExpired = (
	timerState: TurnTimerState,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): boolean => {
	if (config.maxTurnDurationMs === null) {
		return false;
	}

	const elapsed = getElapsedTimeMs(timerState, currentTimestamp);
	return elapsed >= config.maxTurnDurationMs;
};

export const getRemainingTimeMs = (
	timerState: TurnTimerState,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): number | null => {
	if (config.maxTurnDurationMs === null) {
		return null;
	}

	const elapsed = getElapsedTimeMs(timerState, currentTimestamp);
	const remaining = config.maxTurnDurationMs - elapsed;
	return Math.max(0, remaining);
};

export const getElapsedTimeMs = (
	timerState: TurnTimerState,
	currentTimestamp: number = Date.now(),
): number => {
	const accumulated = timerState.accumulatedTimeMs ?? 0;

	if (timerState.pausedAt !== undefined) {
		// Turn is paused, return accumulated time only
		return accumulated;
	}

	// Turn is active, add time since start
	const activeDuration = currentTimestamp - timerState.turnStartedAt;
	return accumulated + activeDuration;
};

export const isInWarningThreshold = (
	timerState: TurnTimerState,
	config: TurnTimerConfig,
	currentTimestamp: number = Date.now(),
): boolean => {
	if (!config.warningThresholdMs || config.maxTurnDurationMs === null) {
		return false;
	}

	const remaining = getRemainingTimeMs(timerState, config, currentTimestamp);
	if (remaining === null) {
		return false;
	}

	return remaining <= config.warningThresholdMs && remaining > 0;
};

export const startTurnTimer = (
	currentTimestamp: number = Date.now(),
): TurnTimerState => ({
	turnStartedAt: currentTimestamp,
	accumulatedTimeMs: 0,
});

export const pauseTurnTimer = (
	timerState: TurnTimerState,
	currentTimestamp: number = Date.now(),
): TurnTimerState => {
	if (timerState.pausedAt !== undefined) {
		return timerState; // Already paused
	}

	const accumulated =
		(timerState.accumulatedTimeMs ?? 0) +
		(currentTimestamp - timerState.turnStartedAt);

	return {
		...timerState,
		pausedAt: currentTimestamp,
		accumulatedTimeMs: accumulated,
	};
};

export const resumeTurnTimer = (
	timerState: TurnTimerState,
	currentTimestamp: number = Date.now(),
): TurnTimerState => {
	if (timerState.pausedAt === undefined) {
		return timerState; // Not paused
	}

	return {
		turnStartedAt: currentTimestamp,
		accumulatedTimeMs: timerState.accumulatedTimeMs ?? 0,
		pausedAt: undefined,
	};
};
