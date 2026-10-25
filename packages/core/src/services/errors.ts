export interface ErrorContext {
	operation: string;
	matchId?: string;
	eventId?: string;
}
export type ErrorReporter = (error: unknown, context: ErrorContext) => void;
export async function bestEffort(
	work: () => unknown | Promise<unknown>,
	context: ErrorContext,
	onError?: ErrorReporter,
): Promise<void> {
	try {
		await work();
	} catch (error) {
		try {
			if (onError) onError(error, context);
			else console.error('[bame]', context, error);
		} catch {
			/* Reporting cannot change a committed action. */
		}
	}
}
