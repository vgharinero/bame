/** Structured transport failure; requestId can be reused when retrying a mutation. */
export class BameTransportError extends Error {
	constructor(
		message: string,
		public requestId?: string,
		public code?: string,
		public params?: Record<string, unknown>,
		public httpStatus?: number,
	) {
		super(message);
	}
}
