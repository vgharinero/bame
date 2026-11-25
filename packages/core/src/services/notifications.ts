import type { Match } from '../engine/index.js';

export const WEBHOOK_TIMEOUT_MS = 5000;

export interface MoveWaitingEvent {
	playerId: string;
	previousMatch: Match;
	match: Match;
}

/**
 * Returns unique player IDs that newly require an action after a move
 * (excluding the mover, players already waiting before the move, and any
 * already-alerted recipients).
 */
export function getNewlyWaitingPlayers(
	event: MoveWaitingEvent,
	alreadyNotified?: ReadonlySet<string>,
): string[] {
	if (event.match.status !== 'active') return [];
	const before = new Set(
		event.previousMatch.turn.waitingFor ?? [
			event.previousMatch.turn.currentPlayerId,
		],
	);
	const waiting = event.match.turn.waitingFor ?? [
		event.match.turn.currentPlayerId,
	];
	return [...new Set(waiting)].filter(
		(id) =>
			id !== event.playerId && !before.has(id) && !alreadyNotified?.has(id),
	);
}

/**
 * Deliver once with a deadline and `Idempotency-Key`. Failures reject so
 * Bame's hook runner can report them via `onError` after commit.
 */
export function createWebhookDispatcher(
	url?: string,
	{ timeoutMs = WEBHOOK_TIMEOUT_MS }: { timeoutMs?: number } = {},
) {
	const target = url?.trim();
	return async (event: string, payload: unknown, eventId?: string) => {
		if (!target) return;
		const response = await fetch(target, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(eventId ? { 'Idempotency-Key': eventId } : {}),
			},
			body: JSON.stringify({
				event,
				payload,
				timestamp: Date.now(),
				...(eventId ? { eventId } : {}),
			}),
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'error',
		});
		await response.body?.cancel();
		if (!response.ok) {
			throw new Error(`Notification webhook returned HTTP ${response.status}`);
		}
	};
}
