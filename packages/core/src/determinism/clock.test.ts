import { describe, expect, it } from 'vitest';
import {
	getElapsedTimeMs,
	getRemainingTimeMs,
	isInWarningThreshold,
	isTurnExpired,
	pauseTurnTimer,
	resumeTurnTimer,
	startTurnTimer,
	type TurnTimer,
	type TurnTimerConfig,
} from './clock';

describe('clock', () => {
	describe('startTurnTimer', () => {
		it('should create initial timer state with given timestamp', () => {
			const timestamp = 1000;
			const state = startTurnTimer(timestamp);

			expect(state.turnStartedAt).toBe(timestamp);
			expect(state.accumulatedTimeMs).toBe(0);
			expect(state.pausedAt).toBeUndefined();
		});

		it('should create timer state with zero accumulated time', () => {
			const state = startTurnTimer(5000);

			expect(state.accumulatedTimeMs).toBe(0);
		});

		it('should handle different timestamp values', () => {
			const state1 = startTurnTimer(0);
			const state2 = startTurnTimer(999999);

			expect(state1.turnStartedAt).toBe(0);
			expect(state2.turnStartedAt).toBe(999999);
		});
	});

	describe('getElapsedTimeMs', () => {
		it('should calculate elapsed time for active timer', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const elapsed = getElapsedTimeMs(timerState, 3000);

			expect(elapsed).toBe(2000);
		});

		it('should include accumulated time when timer is active', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 5000,
				accumulatedTimeMs: 3000,
			};

			const elapsed = getElapsedTimeMs(timerState, 8000);

			expect(elapsed).toBe(6000); // 3000 accumulated + 3000 active
		});

		it('should return only accumulated time when paused', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 5000,
				pausedAt: 6000,
			};

			const elapsed = getElapsedTimeMs(timerState, 10000);

			expect(elapsed).toBe(5000); // Only accumulated, ignores current time
		});

		it('should handle zero accumulated time', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
			};

			const elapsed = getElapsedTimeMs(timerState, 1000);

			expect(elapsed).toBe(0);
		});

		it('should handle undefined accumulated time as zero', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: undefined,
			};

			const elapsed = getElapsedTimeMs(timerState, 5000);

			expect(elapsed).toBe(4000);
		});

		it('should calculate elapsed time deterministically', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 2000,
				accumulatedTimeMs: 1000,
			};

			const elapsed1 = getElapsedTimeMs(timerState, 5000);
			const elapsed2 = getElapsedTimeMs(timerState, 5000);

			expect(elapsed1).toBe(elapsed2);
			expect(elapsed1).toBe(4000);
		});
	});

	describe('getRemainingTimeMs', () => {
		it('should calculate remaining time correctly', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			const remaining = getRemainingTimeMs(timerState, config, 6000);

			expect(remaining).toBe(5000); // 10000 - 5000 elapsed
		});

		it('should return null when maxTurnDurationMs is null', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: null,
			};

			const remaining = getRemainingTimeMs(timerState, config, 5000);

			expect(remaining).toBeNull();
		});

		it('should return zero when time has expired', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			const remaining = getRemainingTimeMs(timerState, config, 10000);

			expect(remaining).toBe(0);
		});

		it('should never return negative values', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 1000,
			};

			const remaining = getRemainingTimeMs(timerState, config, 5000);

			expect(remaining).toBe(0);
			expect(remaining).toBeGreaterThanOrEqual(0);
		});

		it('should account for accumulated time', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 5000,
				accumulatedTimeMs: 3000,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			const remaining = getRemainingTimeMs(timerState, config, 8000);

			expect(remaining).toBe(4000); // 10000 - (3000 + 3000)
		});

		it('should handle exactly at expiration', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			const remaining = getRemainingTimeMs(timerState, config, 6000);

			expect(remaining).toBe(0);
		});
	});

	describe('isTurnExpired', () => {
		it('should return false when time has not expired', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			const expired = isTurnExpired(timerState, config, 5000);

			expect(expired).toBe(false);
		});

		it('should return true when time has expired', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			const expired = isTurnExpired(timerState, config, 10000);

			expect(expired).toBe(true);
		});

		it('should return true at exact expiration time', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			const expired = isTurnExpired(timerState, config, 6000);

			expect(expired).toBe(true);
		});

		it('should return false when maxTurnDurationMs is null', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: null,
			};

			const expired = isTurnExpired(timerState, config, 999999);

			expect(expired).toBe(false);
		});

		it('should account for accumulated time when checking expiration', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 5000,
				accumulatedTimeMs: 7000,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			const expired = isTurnExpired(timerState, config, 8000);

			expect(expired).toBe(true); // 7000 + 3000 = 10000 >= 10000
		});

		it('should handle paused timers correctly', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 4000,
				pausedAt: 5000,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			// Even though current time is way ahead, paused time is only 4000
			const expired = isTurnExpired(timerState, config, 99999);

			expect(expired).toBe(false);
		});
	});

	describe('isInWarningThreshold', () => {
		it('should return false when not in warning threshold', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 2000);

			expect(inWarning).toBe(false); // 9000ms remaining > 2000ms threshold
		});

		it('should return true when in warning threshold', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 9500);

			expect(inWarning).toBe(true); // 1500ms remaining <= 2000ms threshold
		});

		it('should return false when warningThresholdMs is not configured', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 9999);

			expect(inWarning).toBe(false);
		});

		it('should return false when maxTurnDurationMs is null', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: null,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 5000);

			expect(inWarning).toBe(false);
		});

		it('should return false when time has already expired', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 10000);

			expect(inWarning).toBe(false); // 0ms remaining is not > 0
		});

		it('should return true at exact warning threshold', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 9000);

			expect(inWarning).toBe(true); // 2000ms remaining <= 2000ms threshold
		});

		it('should return false with 1ms over warning threshold', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
				warningThresholdMs: 2000,
			};

			const inWarning = isInWarningThreshold(timerState, config, 8999);

			expect(inWarning).toBe(false); // 2001ms remaining > 2000ms threshold
		});
	});

	describe('pauseTurnTimer', () => {
		it('should pause active timer and accumulate time', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const paused = pauseTurnTimer(timerState, 5000);

			expect(paused.pausedAt).toBe(5000);
			expect(paused.accumulatedTimeMs).toBe(4000);
			expect(paused.turnStartedAt).toBe(1000);
		});

		it('should add to existing accumulated time when pausing', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 5000,
				accumulatedTimeMs: 3000,
			};

			const paused = pauseTurnTimer(timerState, 8000);

			expect(paused.accumulatedTimeMs).toBe(6000); // 3000 + 3000
			expect(paused.pausedAt).toBe(8000);
		});

		it('should not change state if already paused', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 5000,
				pausedAt: 6000,
			};

			const paused = pauseTurnTimer(timerState, 10000);

			expect(paused).toBe(timerState); // Same reference
			expect(paused.pausedAt).toBe(6000);
			expect(paused.accumulatedTimeMs).toBe(5000);
		});

		it('should handle undefined accumulated time as zero', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: undefined,
			};

			const paused = pauseTurnTimer(timerState, 4000);

			expect(paused.accumulatedTimeMs).toBe(3000);
		});

		it('should preserve all timer state properties', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 2000,
				accumulatedTimeMs: 1000,
			};

			const paused = pauseTurnTimer(timerState, 5000);

			expect(paused).toHaveProperty('turnStartedAt');
			expect(paused).toHaveProperty('accumulatedTimeMs');
			expect(paused).toHaveProperty('pausedAt');
		});

		it('should create new state object (immutability)', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const paused = pauseTurnTimer(timerState, 3000);

			expect(paused).not.toBe(timerState);
			expect(timerState.pausedAt).toBeUndefined(); // Original unchanged
		});
	});

	describe('resumeTurnTimer', () => {
		it('should resume paused timer', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 5000,
				pausedAt: 6000,
			};

			const resumed = resumeTurnTimer(timerState, 10000);

			expect(resumed.turnStartedAt).toBe(10000);
			expect(resumed.accumulatedTimeMs).toBe(5000);
			expect(resumed.pausedAt).toBeUndefined();
		});

		it('should not change state if not paused', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 3000,
			};

			const resumed = resumeTurnTimer(timerState, 5000);

			expect(resumed).toBe(timerState); // Same reference
		});

		it('should preserve accumulated time when resuming', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 7000,
				pausedAt: 8000,
			};

			const resumed = resumeTurnTimer(timerState, 15000);

			expect(resumed.accumulatedTimeMs).toBe(7000);
		});

		it('should handle undefined accumulated time as zero', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				pausedAt: 5000,
				accumulatedTimeMs: undefined,
			};

			const resumed = resumeTurnTimer(timerState, 10000);

			expect(resumed.accumulatedTimeMs).toBe(0);
		});

		it('should create new state object when resuming (immutability)', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 3000,
				pausedAt: 4000,
			};

			const resumed = resumeTurnTimer(timerState, 10000);

			expect(resumed).not.toBe(timerState);
			expect(timerState.pausedAt).toBe(4000); // Original unchanged
		});
	});

	describe('pause and resume cycle', () => {
		it('should maintain elapsed time across pause/resume cycles', () => {
			// Start timer
			let state = startTurnTimer(1000);

			// Run for 2 seconds
			let elapsed = getElapsedTimeMs(state, 3000);
			expect(elapsed).toBe(2000);

			// Pause at 3 seconds
			state = pauseTurnTimer(state, 3000);
			expect(state.accumulatedTimeMs).toBe(2000);

			// Time passes while paused (should not count)
			elapsed = getElapsedTimeMs(state, 10000);
			expect(elapsed).toBe(2000);

			// Resume at 10 seconds
			state = resumeTurnTimer(state, 10000);

			// Run for 3 more seconds
			elapsed = getElapsedTimeMs(state, 13000);
			expect(elapsed).toBe(5000); // 2000 + 3000
		});

		it('should handle multiple pause/resume cycles', () => {
			let state = startTurnTimer(1000);

			// Active: 1000-3000 (2 seconds)
			state = pauseTurnTimer(state, 3000);
			expect(state.accumulatedTimeMs).toBe(2000);

			// Resume at 5000
			state = resumeTurnTimer(state, 5000);

			// Active: 5000-8000 (3 seconds)
			state = pauseTurnTimer(state, 8000);
			expect(state.accumulatedTimeMs).toBe(5000);

			// Resume at 10000
			state = resumeTurnTimer(state, 10000);

			// Active: 10000-15000 (5 seconds)
			const elapsed = getElapsedTimeMs(state, 15000);
			expect(elapsed).toBe(10000); // 2000 + 3000 + 5000
		});

		it('should correctly calculate expiration with pause/resume', () => {
			const config: TurnTimerConfig = {
				maxTurnDurationMs: 10000,
			};

			let state = startTurnTimer(1000);

			// Run for 6 seconds
			state = pauseTurnTimer(state, 7000);

			// Resume and run for 3 more seconds (total: 9 seconds)
			state = resumeTurnTimer(state, 10000);

			expect(isTurnExpired(state, config, 13000)).toBe(false);

			// Run for 2 more seconds (total: 11 seconds)
			expect(isTurnExpired(state, config, 15000)).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('should handle zero-duration timers', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 0,
			};

			expect(isTurnExpired(timerState, config, 1000)).toBe(true);
			expect(getRemainingTimeMs(timerState, config, 1000)).toBe(0);
		});

		it('should handle very large timestamps', () => {
			const timerState: TurnTimer = {
				turnStartedAt: Number.MAX_SAFE_INTEGER - 10000,
				accumulatedTimeMs: 0,
			};

			const elapsed = getElapsedTimeMs(
				timerState,
				Number.MAX_SAFE_INTEGER - 5000,
			);

			expect(elapsed).toBe(5000);
		});

		it('should handle same start and current timestamp', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 5000,
				accumulatedTimeMs: 0,
			};

			const elapsed = getElapsedTimeMs(timerState, 5000);

			expect(elapsed).toBe(0);
		});

		it('should handle config with only maxTurnDurationMs', () => {
			const timerState: TurnTimer = {
				turnStartedAt: 1000,
				accumulatedTimeMs: 0,
			};

			const config: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			expect(isTurnExpired(timerState, config, 6000)).toBe(true);
			expect(isInWarningThreshold(timerState, config, 5000)).toBe(false);
		});
	});

	describe('type safety', () => {
		it('should return correct types from functions', () => {
			const state: TurnTimer = startTurnTimer(1000);
			const config: TurnTimerConfig = { maxTurnDurationMs: 10000 };

			const elapsed: number = getElapsedTimeMs(state, 2000);
			const remaining: number | null = getRemainingTimeMs(state, config, 2000);
			const expired: boolean = isTurnExpired(state, config, 2000);
			const warning: boolean = isInWarningThreshold(state, config, 2000);
			const paused: TurnTimer = pauseTurnTimer(state, 2000);
			const resumed: TurnTimer = resumeTurnTimer(paused, 3000);

			expect(typeof elapsed).toBe('number');
			expect(typeof expired).toBe('boolean');
			expect(typeof warning).toBe('boolean');
			expect(paused).toHaveProperty('turnStartedAt');
			expect(resumed).toHaveProperty('turnStartedAt');

			// remaining can be null or number
			if (remaining !== null) {
				expect(typeof remaining).toBe('number');
			}
		});

		it('should handle optional config properties correctly', () => {
			const state: TurnTimer = { turnStartedAt: 1000 };

			const config1: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
			};

			const config2: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
				warningThresholdMs: 1000,
			};

			const config3: TurnTimerConfig = {
				maxTurnDurationMs: 5000,
				warningThresholdMs: 1000,
				autoEndTurnOnExpire: true,
			};

			expect(isInWarningThreshold(state, config1, 2000)).toBe(false);
			expect(isInWarningThreshold(state, config2, 2000)).toBeDefined();
			expect(config3.autoEndTurnOnExpire).toBe(true);
		});
	});
});
