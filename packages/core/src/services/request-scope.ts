import { BameTransportError } from './transport-error.js';

/** Own the abort listener and deadline for one RPC or streaming connection attempt. */
export function requestScope(
	parent: AbortSignal | undefined,
	timeoutMs: number | false,
	requestId?: string,
) {
	const controller = new AbortController();
	const abort = () =>
		controller.abort(
			new BameTransportError('Request cancelled', requestId, 'REQUEST_ABORTED'),
		);
	parent?.addEventListener('abort', abort, { once: true });
	if (parent?.aborted) abort();
	const timer =
		timeoutMs === false
			? undefined
			: setTimeout(() => {
					controller.abort(
						new BameTransportError(
							'Request timed out',
							requestId,
							'REQUEST_TIMEOUT',
						),
					);
				}, timeoutMs);
	return {
		signal: controller.signal,
		clearDeadline() {
			clearTimeout(timer);
		},
		dispose() {
			clearTimeout(timer);
			parent?.removeEventListener('abort', abort);
		},
		// Race the deadline even if a custom fetch or async headers callback ignores abort.
		run<T>(task: () => Promise<T>): Promise<T> {
			return new Promise((resolve, reject) => {
				const signal = controller.signal;
				if (signal.aborted) {
					reject(signal.reason);
					return;
				}
				const failed = () => reject(signal.reason);
				signal.addEventListener('abort', failed, { once: true });
				Promise.resolve()
					.then(() => {
						signal.throwIfAborted();
						return task();
					})
					.then(resolve, reject)
					.finally(() => signal.removeEventListener('abort', failed));
			});
		},
	};
}
