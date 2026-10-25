import type { Game } from '../engine/index.js';
import {
	memoryRealtime,
	memoryStorage,
	type Realtime,
	type Storage,
} from '../store/index.js';
import { bestEffort, type ErrorReporter } from './errors.js';
import { createLobbiesService } from './lobbies.js';
import { type BameHooks, createMatchesService } from './matches.js';
import { createProfilesService } from './profiles.js';

export interface CreateBameOptions {
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous game registry
	games: readonly Game<any, any, any, any>[];
	storage?: Storage;
	realtime?: Realtime;
	/**
	 * Optional server lifecycle hooks for multi-day async notifications,
	 * push alerts, emails, or analytics.
	 */
	hooks?: BameHooks;
	onError?: ErrorReporter;
}

export const createBame = (options: CreateBameOptions) => {
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous game registry
	const gameMap = new Map<string, Game<any, any, any, any>>();
	for (const game of options.games) {
		if (gameMap.has(game.name)) {
			throw new Error(`Duplicate game registration for "${game.name}"`);
		}
		gameMap.set(game.name, game);
	}

	const storage = options.storage ?? memoryStorage();
	const transport = options.realtime ?? memoryRealtime();
	const realtime: Realtime = {
		subscribe: transport.subscribe.bind(transport),
		publish: (channel, message) =>
			bestEffort(
				() => transport.publish(channel, message),
				{ operation: 'realtime.publish' },
				options.onError,
			),
	};
	const profiles = createProfilesService(storage, realtime, options.onError);

	return {
		games: gameMap,
		onError: options.onError,
		storage,
		realtime,
		profiles,
		lobbies: createLobbiesService(gameMap, storage, realtime),
		matches: createMatchesService(
			gameMap,
			storage,
			realtime,
			options.hooks,
			options.onError,
		),
	};
};

export type BameInstance = ReturnType<typeof createBame>;

/**
 * Runtime interface shared by both in-process `createBame()` and remote
 * `createBameClient()`, allowing `@bame/ui-react` and `@bame/ui-console`
 * to work identically in local or authoritative-server modes.
 */
// Shared runtime deliberately excludes server maintenance and raw storage access.
export interface BameRuntime {
	lobbies: Omit<BameInstance['lobbies'], 'start'> & {
		start(
			input: import('./lobbies.js').StartLobbyInput,
		): Promise<
			| import('../engine/types.js').MatchView
			| import('../engine/types.js').Match
		>;
	};
	matches: BameInstance['matches'];
	profiles: Pick<
		BameInstance['profiles'],
		'ensure' | 'get' | 'list' | 'update' | 'subscribe'
	>;
}
