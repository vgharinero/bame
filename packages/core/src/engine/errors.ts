import { assertJson } from '../store/json.js';

/** Language-independent error metadata, shared by rules, services and UI adapters. */
export interface ErrorDetails {
	code: string;
	params?: Record<string, unknown>;
}

export type ErrorInput = string | (ErrorDetails & { message?: string });

export interface ErrorResult {
	ok: false;
	error: string;
	code?: string;
	params?: Record<string, unknown>;
}

/** Keep the existing message field while carrying a stable code and parameters. */
export function errorResult(input: ErrorInput): ErrorResult {
	if (typeof input === 'string') return { ok: false, error: input };
	assertJson(input.params, 'error.params');
	return {
		ok: false,
		error: input.message ?? input.code,
		code: input.code,
		...(input.params === undefined ? {} : { params: input.params }),
	};
}

export class BameError extends Error implements ErrorDetails {
	readonly code: string;
	readonly params?: Record<string, unknown>;
	constructor(details: ErrorDetails & { message?: string }) {
		super(details.message ?? details.code);
		assertJson(details.params, 'error.params');
		this.name = 'BameError';
		this.code = details.code;
		this.params = details.params;
	}
}

/** Read metadata from local exceptions, transport exceptions or failed move results. */
export function getErrorDetails(error: unknown): ErrorDetails | null {
	if (
		!error ||
		typeof error !== 'object' ||
		!('code' in error) ||
		typeof error.code !== 'string'
	)
		return null;
	const params = 'params' in error ? error.params : undefined;
	return {
		code: error.code,
		...(params && typeof params === 'object' && !Array.isArray(params)
			? { params: params as Record<string, unknown> }
			: {}),
	};
}
