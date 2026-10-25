import { describe, expect, it } from 'vitest';
import { defineGame, invalid } from '../engine';
import { createBame } from './create-bame';
import { createBameClient, createBameHandler } from './network';

const simpleGame = defineGame({
	name: 'simple',
	players: { min: 2, max: 3 },
	setup: () => ({ coins: 3, secrets: { alice: 'A', bob: 'B', charlie: 'C' } }),
	moves: {
		takeCoin: ({ state }) => {
			if (state.coins <= 0) return invalid('No coins left');
			state.coins -= 1;
		},
	},
	view: ({ state, playerId }) => ({
		coins: state.coins,
		mySecret: playerId
			? state.secrets[playerId as keyof typeof state.secrets]
			: null,
	}),
	endIf: ({ state, player }) =>
		state.coins === 0 ? { winner: player.id } : undefined,
});

describe('createBame services (lobbies & matches)', () => {
	it('should run a full public lobby -> start -> moves -> finish flow with realtime updates', async () => {
		const bame = createBame({ games: [simpleGame] });

		const lobby = await bame.lobbies.create({
			userId: 'alice',
			game: 'simple',
		});
		expect(lobby.isPublic).toBe(true);
		expect(lobby.code).toBeNull();

		const listed = await bame.lobbies.list();
		expect(listed.map((l) => l.id)).toContain(lobby.id);

		await bame.lobbies.join({ userId: 'bob', lobbyId: lobby.id });

		const bobViews: Array<{ coins: number; mySecret: string | null }> = [];
		const unsubBob = bame.matches.subscribe<{
			coins: number;
			mySecret: string | null;
		}>(lobby.id, 'bob', (view) => {
			bobViews.push(view.state);
		});

		const match = await bame.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});
		expect(match.id).toBe(lobby.id);

		// Bob received initial snapshot on match start with only his secret
		expect(bobViews).toEqual([{ coins: 3, mySecret: 'B' }]);

		// Alice takes 1 coin
		const m1 = await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [],
		});
		expect(m1.ok).toBe(true);

		// Alice tries to move again out of turn
		const wrongTurn = await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [],
		});
		expect(wrongTurn).toEqual({ ok: false, error: 'Not your turn' });

		// Bob takes 1 coin
		await bame.matches.move({
			userId: 'bob',
			matchId: match.id,
			move: 'takeCoin',
			args: [],
		});

		// Alice takes the final coin and wins
		const finalMove = await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [],
		});
		expect(finalMove.ok).toBe(true);
		if (finalMove.ok) {
			expect(finalMove.view.status).toBe('finished');
			expect(finalMove.view.result).toEqual({ winner: 'alice' });
		}

		expect(bobViews.map((v) => v.coins)).toEqual([3, 2, 1, 0]);

		// Verify player profiles and stats were automatically updated when the match finished
		const aliceProfile = await bame.profiles.get('alice');
		const bobProfile = await bame.profiles.get('bob');
		expect(aliceProfile?.stats).toEqual({
			wins: 1,
			losses: 0,
			draws: 0,
			totalGames: 1,
		});
		expect(bobProfile?.stats).toEqual({
			wins: 0,
			losses: 1,
			draws: 0,
			totalGames: 1,
		});

		const leaderboard = await bame.profiles.list();
		expect(leaderboard.map((p) => p.id)).toEqual(['alice', 'bob']);

		unsubBob();
	});

	it('should enforce private lobby join-by-code only and prevent join by ID', async () => {
		const bame = createBame({ games: [simpleGame] });

		const privateLobby = await bame.lobbies.create({
			userId: 'alice',
			game: 'simple',
			isPrivate: true,
		});

		expect(privateLobby.isPublic).toBe(false);
		expect(privateLobby.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);

		// Private lobbies do not appear in public list
		expect(await bame.lobbies.list()).toHaveLength(0);

		// Joining private lobby by ID is blocked
		await expect(
			bame.lobbies.join({ userId: 'bob', lobbyId: privateLobby.id }),
		).rejects.toThrow('Private lobbies can only be joined with a join code');

		// Joining by code works
		const joined = await bame.lobbies.joinByCode({
			userId: 'bob',
			code: privateLobby.code as string,
		});
		expect(joined.members).toHaveLength(2);
	});

	it('should enforce ready state, minPlayers, host-only start, and host handoff on leave', async () => {
		const bame = createBame({ games: [simpleGame] });

		const lobby = await bame.lobbies.create({
			userId: 'alice',
			game: 'simple',
			readyByDefault: false,
		});

		// Cannot start with 1 player when minPlayers = 2
		await expect(
			bame.lobbies.start({ userId: 'alice', lobbyId: lobby.id }),
		).rejects.toThrow(/Need at least 2 players/);

		await bame.lobbies.join({
			userId: 'bob',
			lobbyId: lobby.id,
			readyByDefault: false,
		});

		// Non-host cannot start
		await expect(
			bame.lobbies.start({ userId: 'bob', lobbyId: lobby.id }),
		).rejects.toThrow('Only the lobby host can start the match');

		// Cannot start before everyone is ready
		await bame.lobbies.setReady({
			userId: 'alice',
			lobbyId: lobby.id,
			ready: true,
		});
		await expect(
			bame.lobbies.start({ userId: 'alice', lobbyId: lobby.id }),
		).rejects.toThrow('Not all players are ready');

		// Host leaves -> Bob becomes host
		const afterAliceLeft = await bame.lobbies.leave({
			userId: 'alice',
			lobbyId: lobby.id,
		});
		expect(afterAliceLeft?.hostId).toBe('bob');

		// Last member leaves -> lobby is deleted
		const afterBobLeft = await bame.lobbies.leave({
			userId: 'bob',
			lobbyId: lobby.id,
		});
		expect(afterBobLeft).toBeNull();
		expect(await bame.lobbies.get(lobby.id)).toBeNull();
	});

	it('should support authoritative server + client via createBameHandler and createBameClient', async () => {
		const serverBame = createBame({ games: [simpleGame] });
		const handler = createBameHandler(serverBame, {
			unsafeTrustClientIds: true,
		});

		const client = createBameClient({
			url: 'http://bame.test/api/bame',
			fetch: (input, init) =>
				handler.fetch(new Request(input as RequestInfo, init)),
		});

		const lobby = await client.lobbies.create({
			userId: 'alice',
			game: 'simple',
			isPrivate: true,
		});
		expect(lobby.code).toBeTruthy();

		const joined = await client.lobbies.joinByCode({
			userId: 'bob',
			code: lobby.code as string,
		});
		expect(joined.members).toHaveLength(2);

		await client.lobbies.start({ userId: 'alice', lobbyId: lobby.id });

		// Verify Alice only sees her own secret over the network (never Bob's secret or RNG state)
		const aliceView = await client.matches.get<{
			coins: number;
			mySecret: string | null;
		}>(lobby.id, 'alice');
		expect(aliceView?.state).toEqual({ coins: 3, mySecret: 'A' });
		expect('seed' in (aliceView ?? {})).toBe(false);

		const moveRes = await client.matches.move({
			userId: 'alice',
			matchId: lobby.id,
			move: 'takeCoin',
			args: [],
		});
		expect(moveRes.ok).toBe(true);

		// Verify returning player can list their active multi-day matches via client.matches.list
		const bobActiveMatches = await client.matches.list({
			userId: 'bob',
			status: 'active',
		});
		expect(bobActiveMatches.map((m) => m.id)).toEqual([lobby.id]);
		expect(bobActiveMatches[0].turn.currentPlayerId).toBe('bob');
	});

	it('should invoke hooks.onMove and hooks.onNotify and deliver realtime player notifications', async () => {
		const notifyGame = defineGame({
			name: 'notify-game',
			players: 2,
			setup: () => ({ offers: 0 }),
			moves: {
				sendOffer: ({ state, notify, keepTurn }) => {
					state.offers += 1;
					notify({
						to: 'opponents',
						type: 'market_offer',
						message: 'Trade 1 Sheep for 1 Wheat?',
					});
					keepTurn();
				},
				passTurn: () => {},
			},
		});

		const moveEvents: Array<{
			move: string;
			turnChanged: boolean;
			nextPlayerId: string;
		}> = [];
		const notifyEvents: string[] = [];

		const bame = createBame({
			games: [notifyGame],
			hooks: {
				onMove: (evt) => {
					moveEvents.push({
						move: evt.move,
						turnChanged: evt.turnChanged,
						nextPlayerId: evt.nextPlayerId,
					});
				},
				onNotify: (n) => {
					notifyEvents.push(
						`${n.fromPlayerId}->${n.toPlayerIds.join(',')}:${n.type}`,
					);
				},
			},
		});

		const lobby = await bame.lobbies.create({
			userId: 'alice',
			game: 'notify-game',
		});
		await bame.lobbies.join({ userId: 'bob', lobbyId: lobby.id });
		const match = await bame.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});

		const bobInbox: string[] = [];
		const unsubBobInbox = bame.matches.subscribeNotifications('bob', (n) => {
			bobInbox.push(n.message);
		});

		await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'sendOffer',
		});
		expect(bobInbox).toEqual(['Trade 1 Sheep for 1 Wheat?']);
		expect(notifyEvents).toEqual(['alice->bob:market_offer']);
		expect(moveEvents).toEqual([
			{ move: 'sendOffer', turnChanged: false, nextPlayerId: 'alice' },
		]);

		await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'passTurn',
		});
		expect(moveEvents[1]).toEqual({
			move: 'passTurn',
			turnChanged: true,
			nextPlayerId: 'bob',
		});
		// Bob also received an automatic 'your_turn' notification when Alice passed the turn!
		expect(bobInbox).toEqual([
			'Trade 1 Sheep for 1 Wheat?',
			'Action required from you in notify-game!',
		]);

		const waitingForBob = await bame.matches.list({
			userId: 'bob',
			waitingForUserId: 'bob',
		});
		expect(waitingForBob.map((m) => m.id)).toEqual([match.id]);

		unsubBobInbox();
	});

	it('should support matches.undo and matches.forfeit via createBameClient and update profile stats', async () => {
		const undoableGame = defineGame({
			name: 'undoable',
			players: 2,
			turn: { allowUndo: true },
			setup: () => ({ steps: 0 }),
			moves: {
				step: ({ state }) => {
					state.steps += 1;
				},
			},
		});

		const serverBame = createBame({ games: [undoableGame] });
		const handler = createBameHandler(serverBame, {
			unsafeTrustClientIds: true,
		});
		const client = createBameClient({
			url: 'http://bame.test/api/bame',
			fetch: (input, init) =>
				handler.fetch(new Request(input as RequestInfo, init)),
		});

		const lobby = await client.lobbies.create({
			userId: 'alice',
			game: 'undoable',
		});
		await client.lobbies.join({ userId: 'bob', lobbyId: lobby.id });
		const match = await client.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});

		await client.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'step',
		});

		const undone = await client.matches.undo<{ steps: number }>({
			userId: 'alice',
			matchId: match.id,
		});
		expect(undone.ok).toBe(true);
		if (undone.ok) {
			expect(undone.view.state.steps).toBe(0);
			expect(undone.view.turn.currentPlayerId).toBe('alice');
		}

		// Bob forfeits -> Alice gets a win in profile stats
		const forfeited = await client.matches.forfeit({
			userId: 'bob',
			matchId: match.id,
		});
		expect(forfeited.ok).toBe(true);
		if (forfeited.ok) {
			expect(forfeited.view.status).toBe('finished');
			expect(forfeited.view.result).toEqual({
				winner: 'alice',
				reason: 'bob forfeited',
			});
		}

		const aliceProfile = await client.profiles.get('alice');
		expect(aliceProfile?.stats.wins).toBe(1);
		expect(aliceProfile?.statsByGame?.undoable).toEqual({
			wins: 1,
			losses: 0,
			draws: 0,
			totalGames: 1,
			totalScore: 0,
		});
	});

	it('should enforce server-side authentication via createBameHandler({ getUserId }) and block impersonation', async () => {
		const serverBame = createBame({ games: [simpleGame] });
		const handler = createBameHandler(serverBame, {
			getUserId: (req) => {
				const authHeader = req.headers.get('authorization');
				return authHeader?.startsWith('Bearer ')
					? authHeader.slice('Bearer '.length)
					: null;
			},
		});

		let currentToken: string | null = 'alice';
		const client = createBameClient({
			url: 'http://bame.test/api/bame',
			headers: () =>
				currentToken
					? ({ Authorization: `Bearer ${currentToken}` } as Record<
							string,
							string
						>)
					: ({} as Record<string, string>),
			fetch: (input, init) =>
				handler.fetch(new Request(input as RequestInfo, init)),
		});

		// Alice (authenticated as 'alice') creates a lobby
		const lobby = await client.lobbies.create({
			userId: 'alice',
			game: 'simple',
		});

		// Alice tries to impersonate 'bob' while authenticated as 'alice' -> blocked with Forbidden!
		await expect(
			client.lobbies.join({ userId: 'bob', lobbyId: lobby.id }),
		).rejects.toThrow(/Forbidden/);

		// Switch token to 'bob' -> Bob joins legitimately
		currentToken = 'bob';
		await client.lobbies.join({ userId: 'bob', lobbyId: lobby.id });

		// Unauthenticated request -> blocked with Unauthorized!
		currentToken = null;
		await expect(
			client.lobbies.start({ userId: 'alice', lobbyId: lobby.id }),
		).rejects.toThrow('Unauthorized');

		// Switch back to 'alice' -> starts match and plays
		currentToken = 'alice';
		const match = await client.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});

		// Alice cannot read Bob's secret view when getUserId is enforced
		await expect(client.matches.get(match.id, 'bob')).rejects.toThrow(
			/Forbidden/,
		);
	});

	it('should deduplicate requestId retries, reject conflicting reused requestIds or stale expectedVersion, and enforce undo finality', async () => {
		const undoableCoinGame = defineGame({
			name: 'undoable-coin',
			players: 2,
			turn: { allowUndo: true },
			setup: () => ({ coins: 2 }),
			moves: {
				takeCoin: ({ state }, amount: number = 1) => {
					if (amount > state.coins) return invalid('Too many coins');
					state.coins -= amount;
				},
			},
			endIf: ({ state, player }) =>
				state.coins === 0 ? { winner: player.id } : undefined,
		});

		const bame = createBame({ games: [undoableCoinGame] });
		const lobby = await bame.lobbies.create({
			userId: 'alice',
			game: 'undoable-coin',
		});
		await bame.lobbies.join({ userId: 'bob', lobbyId: lobby.id });
		const match = await bame.lobbies.start({
			userId: 'alice',
			lobbyId: lobby.id,
		});

		// 1. First move with requestId + expectedVersion
		const move1 = await bame.matches.move<{ coins: number }>({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [1],
			requestId: 'req-1',
			expectedVersion: 1,
		});
		expect(move1.ok).toBe(true);
		if (move1.ok) {
			expect(move1.duplicate).toBe(false);
			expect(move1.appliedVersion).toBe(2);
			expect(move1.view.state.coins).toBe(1);
		}

		// 2. Retrying the exact same requestId + payload returns duplicate: true without taking another coin
		const retryMove1 = await bame.matches.move<{ coins: number }>({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [1],
			requestId: 'req-1',
			expectedVersion: 1,
		});
		expect(retryMove1.ok).toBe(true);
		if (retryMove1.ok) {
			expect(retryMove1.duplicate).toBe(true);
			expect(retryMove1.appliedVersion).toBe(2);
			expect(retryMove1.view.state.coins).toBe(1);
		}

		// 3. Reusing the same requestId with different args returns CONFLICT
		const conflictReuse = await bame.matches.move({
			userId: 'alice',
			matchId: match.id,
			move: 'takeCoin',
			args: [2],
			requestId: 'req-1',
			expectedVersion: 1,
		});
		expect(conflictReuse).toEqual({
			ok: false,
			error: 'Request ID was reused with different input',
			code: 'CONFLICT',
		});

		// 4. Stale expectedVersion with a new requestId is rejected
		const staleVersion = await bame.matches.move({
			userId: 'bob',
			matchId: match.id,
			move: 'takeCoin',
			args: [1],
			requestId: 'req-2',
			expectedVersion: 1,
		});
		expect(staleVersion.ok).toBe(false);

		// 5. Only the last mover ('alice') may undo
		const bobUndo = await bame.matches.undo({
			userId: 'bob',
			matchId: match.id,
		});
		expect(bobUndo).toEqual({
			ok: false,
			error: 'Only the last mover may undo',
		});

		// 6. Bob finishes the game; finished matches cannot be undone
		const finishRes = await bame.matches.move({
			userId: 'bob',
			matchId: match.id,
			move: 'takeCoin',
			args: [1],
			requestId: 'req-finish',
			expectedVersion: 2,
		});
		expect(finishRes.ok).toBe(true);

		const undoAfterFinish = await bame.matches.undo({
			userId: 'bob',
			matchId: match.id,
		});
		expect(undoAfterFinish).toEqual({
			ok: false,
			error: 'Finished matches are final',
		});
	});
});
