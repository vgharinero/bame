import {
	createMatch,
	type Game,
	type Match,
	type MoveMap,
	viewFor,
} from '../engine/index.js';
import {
	assertJson,
	type Realtime,
	type Storage,
	type SubscriptionOptions,
	type Unsubscribe,
	VersionConflictError,
} from '../store/index.js';

const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a 6-character unambiguous alphanumeric join code using Web CSPRNG.
 */
export const generateJoinCode = (length = 6): string => {
	const bytes = new Uint32Array(length);
	globalThis.crypto.getRandomValues(bytes);
	let code = '';
	for (let i = 0; i < length; i++) {
		code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length];
	}
	return code;
};

export type LobbyStatus = 'open' | 'started';

export interface LobbyMember {
	userId: string;
	ready: boolean;
	joinedAt: number;
}

export interface Lobby<TConfig = unknown> {
	id: string;
	version: number;
	game: string;
	hostId: string;
	status: LobbyStatus;
	isPublic: boolean;
	code: string | null;
	minPlayers: number;
	maxPlayers: number;
	config: TConfig;
	members: LobbyMember[];
	matchId?: string;
	createdAt: number;
	updatedAt: number;
}

export interface CreateLobbyInput<TConfig = unknown> {
	userId: string;
	game: string;
	config?: TConfig;
	isPrivate?: boolean;
	/** Default ready state for joining players (default: true for zero-friction start) */
	readyByDefault?: boolean;
}

export interface JoinLobbyInput {
	userId: string;
	lobbyId: string;
	readyByDefault?: boolean;
}

export interface JoinLobbyByCodeInput {
	userId: string;
	code: string;
	readyByDefault?: boolean;
}

export interface SetReadyInput {
	userId: string;
	lobbyId: string;
	ready: boolean;
}

export interface LeaveLobbyInput {
	userId: string;
	lobbyId: string;
}

export interface StartLobbyInput {
	userId: string;
	lobbyId: string;
	seed?: string;
}

export const lobbyChannel = (lobbyId: string) =>
	`lobby:${encodeURIComponent(lobbyId)}`;
export const matchPlayerChannel = (matchId: string, userId: string) =>
	`match:${encodeURIComponent(matchId)}:player:${encodeURIComponent(userId)}`;

const MAX_CAS_RETRIES = 5;

export const createLobbiesService = (
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous game registry
	games: Map<string, Game<any, any, any, any>>,
	storage: Storage,
	realtime: Realtime,
) => {
	// biome-ignore lint/suspicious/noExplicitAny: heterogeneous game registry
	const requireGame = (name: string): Game<any, any, any, any> => {
		const game = games.get(name);
		if (!game) {
			throw new Error(`Unknown game "${name}"`);
		}
		return game;
	};

	const generateUniqueCode = async (): Promise<string> => {
		for (let attempt = 0; attempt < 10; attempt++) {
			const code = generateJoinCode();
			const existing = await storage.find<Lobby>('lobbies', { code });
			if (existing.length === 0) {
				return code;
			}
		}
		throw new Error('Failed to generate a unique lobby join code');
	};

	return {
		async create<TConfig = unknown>(
			input: CreateLobbyInput<TConfig>,
		): Promise<Lobby<TConfig>> {
			const game = requireGame(input.game);
			const isPublic = !input.isPrivate;
			assertJson(input.config, 'config');
			const configError = game.validateConfig?.(input.config);
			if (configError) throw new Error(configError);
			const code = input.isPrivate ? await generateUniqueCode() : null;
			const now = Date.now();
			const ready = input.readyByDefault ?? true;

			const lobby: Lobby<TConfig> = {
				id: globalThis.crypto.randomUUID(),
				version: 1,
				game: game.name,
				hostId: input.userId,
				status: 'open',
				isPublic,
				code,
				minPlayers: game.minPlayers,
				maxPlayers: game.maxPlayers,
				config: (input.config ?? undefined) as TConfig,
				members: [
					{
						userId: input.userId,
						ready,
						joinedAt: now,
					},
				],
				createdAt: now,
				updatedAt: now,
			};

			await storage.create('lobbies', lobby);
			await realtime.publish(lobbyChannel(lobby.id), lobby);
			return lobby;
		},

		async get<TConfig = unknown>(
			lobbyId: string,
			userId?: string,
		): Promise<Lobby<TConfig> | null> {
			const lobby = await storage.get<Lobby<TConfig>>('lobbies', lobbyId);
			if (!lobby) return null;

			if (!lobby.isPublic) {
				const isMember = lobby.members.some((m) => m.userId === userId);
				if (!isMember) {
					throw new Error(
						'You do not have permission to view this private lobby',
					);
				}
			}

			return lobby;
		},

		async list(gameName?: string): Promise<Lobby[]> {
			const filter: Partial<Lobby> = {
				status: 'open',
				isPublic: true,
				...(gameName ? { game: gameName } : {}),
			};
			return storage.find<Lobby>('lobbies', filter);
		},

		async join(input: JoinLobbyInput): Promise<Lobby> {
			for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
				const lobby = await storage.get<Lobby>('lobbies', input.lobbyId);
				if (!lobby) {
					throw new Error('Lobby not found');
				}
				if (!lobby.isPublic) {
					throw new Error(
						'Private lobbies can only be joined with a join code',
					);
				}
				if (lobby.status !== 'open') {
					throw new Error('Lobby is no longer open');
				}
				if (lobby.members.some((m) => m.userId === input.userId)) {
					return lobby;
				}
				if (lobby.members.length >= lobby.maxPlayers) {
					throw new Error('Lobby is full');
				}

				const now = Date.now();
				const updated: Lobby = {
					...lobby,
					version: lobby.version + 1,
					members: [
						...lobby.members,
						{
							userId: input.userId,
							ready: input.readyByDefault ?? true,
							joinedAt: now,
						},
					],
					updatedAt: now,
				};

				try {
					await storage.update('lobbies', updated, lobby.version);
					await realtime.publish(lobbyChannel(lobby.id), updated);
					return updated;
				} catch (err) {
					if (
						err instanceof VersionConflictError &&
						attempt < MAX_CAS_RETRIES - 1
					) {
						continue;
					}
					throw err;
				}
			}
			throw new Error('Failed to join lobby due to concurrent updates');
		},

		async joinByCode(input: JoinLobbyByCodeInput): Promise<Lobby> {
			const normalizedCode = input.code.trim().toUpperCase();
			for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
				const matches = await storage.find<Lobby>('lobbies', {
					code: normalizedCode,
				});
				if (matches.length > 1)
					throw new Error('Ambiguous join code; recreate the lobby');
				const lobby = matches[0];
				if (!lobby) {
					throw new Error('Lobby not found for code');
				}
				if (lobby.status !== 'open') {
					throw new Error('Lobby is no longer open');
				}
				if (lobby.members.some((m) => m.userId === input.userId)) {
					return lobby;
				}
				if (lobby.members.length >= lobby.maxPlayers) {
					throw new Error('Lobby is full');
				}

				const now = Date.now();
				const updated: Lobby = {
					...lobby,
					version: lobby.version + 1,
					members: [
						...lobby.members,
						{
							userId: input.userId,
							ready: input.readyByDefault ?? true,
							joinedAt: now,
						},
					],
					updatedAt: now,
				};

				try {
					await storage.update('lobbies', updated, lobby.version);
					await realtime.publish(lobbyChannel(lobby.id), updated);
					return updated;
				} catch (err) {
					if (
						err instanceof VersionConflictError &&
						attempt < MAX_CAS_RETRIES - 1
					) {
						continue;
					}
					throw err;
				}
			}
			throw new Error('Failed to join lobby due to concurrent updates');
		},

		async setReady(input: SetReadyInput): Promise<Lobby> {
			for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
				const lobby = await storage.get<Lobby>('lobbies', input.lobbyId);
				if (!lobby) {
					throw new Error('Lobby not found');
				}
				if (lobby.status !== 'open') {
					throw new Error('Cannot change ready state after lobby has started');
				}
				const memberIndex = lobby.members.findIndex(
					(m) => m.userId === input.userId,
				);
				if (memberIndex === -1) {
					throw new Error('You are not a member of this lobby');
				}

				const updatedMembers = lobby.members.map((m, idx) =>
					idx === memberIndex ? { ...m, ready: input.ready } : m,
				);

				const updated: Lobby = {
					...lobby,
					version: lobby.version + 1,
					members: updatedMembers,
					updatedAt: Date.now(),
				};

				try {
					await storage.update('lobbies', updated, lobby.version);
					await realtime.publish(lobbyChannel(lobby.id), updated);
					return updated;
				} catch (err) {
					if (
						err instanceof VersionConflictError &&
						attempt < MAX_CAS_RETRIES - 1
					) {
						continue;
					}
					throw err;
				}
			}
			throw new Error('Failed to update ready state due to concurrent updates');
		},

		async leave(input: LeaveLobbyInput): Promise<Lobby | null> {
			for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
				const lobby = await storage.get<Lobby>('lobbies', input.lobbyId);
				if (!lobby) {
					return null;
				}

				const remaining = lobby.members.filter(
					(m) => m.userId !== input.userId,
				);
				if (remaining.length === lobby.members.length) {
					return lobby;
				}

				if (remaining.length === 0) {
					try {
						await storage.commit([
							{
								type: 'delete',
								collection: 'lobbies',
								id: lobby.id,
								expectedVersion: lobby.version,
							},
						]);
					} catch (error) {
						if (
							error instanceof VersionConflictError &&
							attempt < MAX_CAS_RETRIES - 1
						)
							continue;
						throw error;
					}
					return null;
				}

				const nextHostId =
					lobby.hostId === input.userId ? remaining[0].userId : lobby.hostId;

				const updated: Lobby = {
					...lobby,
					version: lobby.version + 1,
					hostId: nextHostId,
					members: remaining,
					updatedAt: Date.now(),
				};

				try {
					await storage.update('lobbies', updated, lobby.version);
					await realtime.publish(lobbyChannel(lobby.id), updated);
					return updated;
				} catch (err) {
					if (
						err instanceof VersionConflictError &&
						attempt < MAX_CAS_RETRIES - 1
					) {
						continue;
					}
					throw err;
				}
			}
			throw new Error('Failed to leave lobby due to concurrent updates');
		},

		async start(input: StartLobbyInput): Promise<Match> {
			for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
				const lobby = await storage.get<Lobby>('lobbies', input.lobbyId);
				if (!lobby) {
					throw new Error('Lobby not found');
				}

				if (lobby.hostId !== input.userId)
					throw new Error('Only the lobby host can start the match');
				// Idempotent: if already started and match exists, return existing match
				if (lobby.status === 'started' && lobby.matchId) {
					const existingMatch = await storage.get<Match>(
						'matches',
						lobby.matchId,
					);
					if (existingMatch) {
						return existingMatch;
					}
				}

				if (lobby.hostId !== input.userId) {
					throw new Error('Only the lobby host can start the match');
				}
				if (lobby.members.length < lobby.minPlayers) {
					throw new Error(
						`Need at least ${lobby.minPlayers} players to start (currently ${lobby.members.length})`,
					);
				}
				if (lobby.members.length > lobby.maxPlayers) {
					throw new Error(
						`Lobby exceeds maximum players (${lobby.maxPlayers})`,
					);
				}
				if (!lobby.members.every((m) => m.ready)) {
					throw new Error('Not all players are ready');
				}

				const game = requireGame(lobby.game);
				const matchId = lobby.id;
				const match = createMatch(
					game as Game<unknown, MoveMap<unknown>, unknown, unknown>,
					{
						id: matchId,
						players: lobby.members.map((m) => m.userId),
						config: lobby.config,
						seed: input.seed,
					},
				);

				const updatedLobby: Lobby = {
					...lobby,
					version: lobby.version + 1,
					status: 'started',
					matchId: match.id,
					updatedAt: Date.now(),
				};

				// CAS update lobby first so concurrent start calls cannot both succeed
				try {
					await storage.commit([
						{
							type: 'update',
							collection: 'lobbies',
							doc: updatedLobby,
							expectedVersion: lobby.version,
						},
						{ type: 'create', collection: 'matches', doc: match },
					]);
				} catch (error) {
					if (
						error instanceof VersionConflictError &&
						attempt < MAX_CAS_RETRIES - 1
					)
						continue;
					throw error;
				}

				await realtime.publish(lobbyChannel(lobby.id), updatedLobby);
				for (const player of match.players) {
					const view = viewFor(game, match, player.id);
					await realtime.publish(matchPlayerChannel(match.id, player.id), {
						version: match.version,
						view,
					});
				}

				return match;
			}
			throw new Error('Concurrent lobby start');
		},

		subscribe(
			lobbyId: string,
			callback: (lobby: Lobby) => void | Promise<void>,
			options?: SubscriptionOptions,
		): Unsubscribe {
			return realtime.subscribe<Lobby>(
				lobbyChannel(lobbyId),
				callback,
				options,
			);
		},
	};
};
