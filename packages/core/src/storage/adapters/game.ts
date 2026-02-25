import type {
	Action,
	Game,
	GameStatus,
	Lobby,
	LobbyMember,
	Player,
	PlayerStatus,
	Turn,
} from '../../domain';
import type {
	KeysOfType,
	Payload,
	PayloadMap,
	Serializable,
} from '../../primitives';
import type { AtomicOperation } from '../atomic-operation';
import {
	ActionMapper,
	GameMapper,
	LobbyMapper,
	LobbyMemberMapper,
	PlayerMapper,
} from '../mappers';
import { VersionedStorage } from '../realtime/versioned-storage';
import { TABLES } from '../schema';
import type { GameRecord } from '../schema/game';
import type { PlayerRecord } from '../schema/player';
import type { ProfileRecord } from '../schema/profile';
import type { VersionedRecord } from '../schema/versioned';

export class GameStorageAdapter extends VersionedStorage {
	async createGameFromLobby<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		lobby: Lobby,
		initialTurn: Turn<TActionPayloadMap, TPhasePayloadMap>,
		publicState: Payload,
		privateStates: Record<string, Payload>,
		seed: string,
	): Promise<
		Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>
	> {
		const gameId = lobby.id;
		const gameData: Omit<GameRecord, keyof VersionedRecord> = {
			config: lobby.gameConfig,
			currentTurn: initialTurn as unknown as Serializable,
			publicState: publicState,
			seed,
			status: 'waiting' satisfies GameStatus,
		};
		const gameInsert = this.prepareInsert(TABLES.GAMES, gameId, gameData);

		const playersData: Omit<PlayerRecord, keyof VersionedRecord>[] =
			lobby.members.map((lm) => ({
				gameId,
				userId: lm.id.userId,
				privateState: privateStates[lm.id.userId],
				status: 'syncing' satisfies PlayerStatus,
			}));
		const playerInserts = playersData.map((p) =>
			this.prepareInsert(
				TABLES.PLAYERS,
				PlayerMapper.playerId({ gameId, userId: p.userId }),
				p,
			),
		);

		const { lobbyRecord, lobbyMemberRecordsWithPublicUserInfo } =
			LobbyMapper.toRecord(lobby);

		await this.dataSource.performAtomic([
			// create game
			gameInsert,
			// create game players
			...playerInserts,
			// sync lobby members
			...lobbyMemberRecordsWithPublicUserInfo.map(({ lobbyMemberRecord }) =>
				this.prepareUpdate(TABLES.LOBBY_MEMBERS, lobbyMemberRecord),
			),
			// sync lobby updates
			this.prepareUpdate(TABLES.LOBBIES, lobbyRecord),
		]);

		const gameRecord = gameInsert.record;
		const playerRecordsWithPublicUserInfo = playerInserts.map(
			({ record: data }) => {
				// biome-ignore lint/style/noNonNullAssertion: no need to check
				const { displayName, avatarUrl } = lobby.members.find(
					(m) => m.id.userId === data.userId,
				)!;
				return {
					playerRecord: data,
					publicUserInfo: { displayName, avatarUrl },
				};
			},
		);

		return GameMapper.toDomain({
			gameRecord,
			playerRecordsWithPublicUserInfo,
		});
	}

	async syncMemberToPlayer(
		lobbyMember: LobbyMember,
		player: Player,
	): Promise<void> {
		const lobbyMemberRecord = LobbyMemberMapper.toRecord(lobbyMember);
		const playerRecord = PlayerMapper.toRecord(player);

		await this.dataSource.performAtomic([
			// update lobby member
			this.prepareUpdate(TABLES.LOBBY_MEMBERS, lobbyMemberRecord),
			// update player
			this.prepareUpdate(TABLES.PLAYERS, playerRecord),
		]);
	}

	async getGame<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		gameId: string,
	): Promise<Game<
		TConfig,
		TPublicState,
		TPrivateState,
		TActionPayloadMap,
		TPhasePayloadMap
	> | null> {
		const gameRecord = await this.dataSource.performGet(TABLES.GAMES, gameId);
		if (!gameRecord) {
			return null;
		}

		const playerRecords = await this.dataSource.performGetManyByField(
			TABLES.PLAYERS,
			'gameId',
			gameId,
		);
		const profileRecords = await this.dataSource.performGetMany(
			TABLES.PROFILES,
			playerRecords.map((p) => p.userId),
		);

		const playerRecordsWithPublicUserInfo = playerRecords.map(
			(playerRecord) => {
				const profileRecord = profileRecords.find(
					(pr) => pr.id === playerRecord.userId,
				);
				if (!profileRecord) {
					throw new Error(
						`Profile not found for userId: ${playerRecord.userId}`,
					);
				}
				return {
					playerRecord,
					publicUserInfo: {
						displayName: profileRecord.displayName,
						avatarUrl: profileRecord.avatarUrl,
					},
				};
			},
		);

		return GameMapper.toDomain({
			gameRecord,
			playerRecordsWithPublicUserInfo,
		});
	}

	async updateGame<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
	): Promise<void> {
		const { gameRecord, playerRecordsWithPublicUserInfo } =
			GameMapper.toRecord(game);
		await this.dataSource.performAtomic([
			this.prepareUpdate(TABLES.GAMES, gameRecord),
			...playerRecordsWithPublicUserInfo.map(({ playerRecord }) =>
				this.prepareUpdate(TABLES.PLAYERS, playerRecord),
			),
		]);
	}

	async applyAction<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
		action: Action<TActionPayloadMap, TPhasePayloadMap>,
	): Promise<string> {
		const { gameRecord, playerRecordsWithPublicUserInfo } =
			GameMapper.toRecord(game);
		const actionId = this.generateId();
		const actionRecord = ActionMapper.toRecord(actionId, action, game.id);

		await this.dataSource.performAtomic([
			// update game
			this.prepareUpdate(TABLES.GAMES, gameRecord),
			// update player (private states)
			...playerRecordsWithPublicUserInfo.map(({ playerRecord }) =>
				this.prepareUpdate(TABLES.PLAYERS, playerRecord),
			),
			// log action history (not-versioned)
			{ type: 'insert', table: TABLES.ACTIONS, record: actionRecord },
		]);

		return actionId;
	}

	async endGame<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		game: Game<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
		playerResults: Record<string, boolean>,
		isDraw: boolean,
	): Promise<void> {
		const { gameRecord } = GameMapper.toRecord(game);
		const operations: AtomicOperation[] = [
			this.prepareUpdate(TABLES.GAMES, gameRecord),
		];

		for (const userId in playerResults) {
			const isWinner = playerResults[userId];

			const statsDelta: Partial<
				Record<KeysOfType<ProfileRecord, number>, number>
			> = isDraw ? { draws: 1 } : isWinner ? { wins: 1 } : { losses: 1 };

			operations.push(
				this.prepareDeltaUpdates('profiles', userId, {
					totalGames: 1,
					...statsDelta,
				}),
			);
		}

		await this.dataSource.performAtomic(operations);
	}
}
