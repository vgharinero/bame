import { jsonClone } from './json.js';
import {
	type Doc,
	type StorageOperation,
	VersionConflictError,
} from './types.js';

/** Shared preconditions for adapters. Validate every operation before writing. */
export function validateBatch(
	operations: readonly StorageOperation[],
	existing: readonly (Doc<unknown> | null)[],
): void {
	const keys = new Set<string>();
	for (const [i, op] of operations.entries()) {
		const id = op.type === 'delete' ? op.id : op.doc.id;
		const key = JSON.stringify([op.collection, id]);
		if (
			!['lobbies', 'matches', 'profiles'].includes(op.collection) ||
			!id ||
			keys.has(key)
		)
			throw new Error('Invalid or duplicate batch document');
		keys.add(key);
		const current = existing[i];
		const expected = op.type === 'create' ? 0 : op.expectedVersion;
		if (!Number.isSafeInteger(expected) || expected < 0)
			throw new Error('Invalid expected version');
		if (
			op.type === 'create'
				? current !== null
				: !current || current.version !== expected
		)
			throw new VersionConflictError(
				op.collection,
				id,
				expected,
				current?.version,
			);
		if (op.type !== 'delete') {
			jsonClone(op.doc);
			if (op.doc.version !== expected + 1)
				throw new Error('Document version must advance by one');
		}
	}
}
