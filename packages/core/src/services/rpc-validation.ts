import type { RpcAction } from './network.js';

export class HttpError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
	) {
		super(message);
	}
}
const invalid = (message = 'Invalid RPC request'): never => {
	throw new HttpError(400, 'INVALID_REQUEST', message);
};
export const identifier = (value: unknown): value is string =>
	typeof value === 'string' &&
	value.length > 0 &&
	value.length <= 256 &&
	[...value].every((c) => c.charCodeAt(0) >= 32 && c !== '/');
const object = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return invalid();
	return value as Record<string, unknown>;
};
const fields = (value: unknown, allowed: string[]) => {
	const record = object(value);
	if (Object.keys(record).some((key) => !allowed.includes(key)))
		invalid('Unexpected request field');
	return record;
};
const id = (value: unknown, optional = false) => {
	if (optional && (value === undefined || value === null)) return;
	if (!identifier(value)) invalid('Invalid identifier');
};
const bool = (value: unknown) => {
	if (value !== undefined && typeof value !== 'boolean')
		invalid('Expected boolean');
};
const profile = (value: unknown) => {
	if (value === undefined || value === null) return;
	const p = fields(value, ['displayName', 'avatarUrl']);
	if (
		p.displayName !== undefined &&
		(typeof p.displayName !== 'string' || p.displayName.length > 256)
	)
		invalid('Invalid display name');
	if (
		p.avatarUrl !== undefined &&
		p.avatarUrl !== null &&
		(typeof p.avatarUrl !== 'string' || p.avatarUrl.length > 2048)
	)
		invalid('Invalid avatar URL');
};

export function validateRpc(value: unknown): RpcAction {
	const rpc = fields(value, ['service', 'method', 'args']);
	if (!Array.isArray(rpc.args) || typeof rpc.method !== 'string') invalid();
	const args = rpc.args as unknown[];
	const method = rpc.method as string;
	const arity = (min: number, max = min) => {
		if (args.length < min || args.length > max)
			invalid('Invalid argument count');
	};
	if (rpc.service === 'lobbies') {
		if (method === 'get') {
			arity(1, 2);
			id(args[0]);
			id(args[1], true);
		} else if (method === 'list') {
			arity(0, 1);
			id(args[0], true);
		} else {
			arity(1);
			const allowed: Record<string, string[]> = {
				create: ['userId', 'game', 'config', 'isPrivate', 'readyByDefault'],
				join: ['userId', 'lobbyId', 'readyByDefault'],
				joinByCode: ['userId', 'code', 'readyByDefault'],
				setReady: ['userId', 'lobbyId', 'ready'],
				leave: ['userId', 'lobbyId'],
				start: ['userId', 'lobbyId'],
			};
			if (!Object.hasOwn(allowed, method)) invalid('Unknown lobby method');
			const input = fields(args[0], allowed[method]);
			id(input.userId, true);
			if (method === 'create') {
				id(input.game);
				bool(input.isPrivate);
			} else if (method === 'joinByCode') id(input.code);
			else id(input.lobbyId);
			bool(input.readyByDefault);
			if (method === 'setReady' && typeof input.ready !== 'boolean')
				invalid('Expected ready boolean');
		}
	} else if (rpc.service === 'matches') {
		if (method === 'get') {
			arity(1, 2);
			id(args[0]);
			id(args[1], true);
		} else if (method === 'list') {
			arity(0, 1);
			const filter =
				args[0] == null
					? {}
					: fields(args[0], ['userId', 'waitingForUserId', 'status', 'game']);
			id(filter.userId, true);
			id(filter.waitingForUserId, true);
			id(filter.game, true);
			if (
				filter.status !== undefined &&
				!['active', 'finished'].includes(filter.status as string)
			)
				invalid('Invalid match status');
		} else if (['move', 'undo', 'forfeit'].includes(method)) {
			arity(1);
			const input = fields(args[0], [
				'userId',
				'matchId',
				'requestId',
				'expectedVersion',
				...(method === 'move' ? ['move', 'args'] : []),
			]);
			id(input.userId, true);
			id(input.matchId);
			id(input.requestId);
			if (
				!Number.isSafeInteger(input.expectedVersion) ||
				(input.expectedVersion as number) < 1
			)
				invalid('expectedVersion is required');
			if (method === 'move') {
				id(input.move);
				if (input.args !== undefined && !Array.isArray(input.args))
					invalid('Move args must be an array');
			}
		} else invalid('Unknown match method');
	} else if (rpc.service === 'profiles') {
		if (method === 'list') arity(0);
		else if (method === 'get') {
			arity(1);
			id(args[0]);
		} else if (method === 'ensure' || method === 'update') {
			arity(1, 2);
			id(args[0], true);
			profile(args[1]);
		} else invalid('Unknown profile method');
	} else invalid('Unknown service');
	return rpc as unknown as RpcAction;
}
