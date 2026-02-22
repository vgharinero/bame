import {
	getRandomCode,
	type Lobby,
	type LobbyMemberStatus,
	type LobbyStatus,
} from '../../domain';
import type { Payload } from '../../primitives';
import { LobbyMapper, LobbyMemberMapper } from '../mappers';
import { VersionedStorage } from '../realtime/versioned-storage';
import { TABLES } from '../schema';
import type { LobbyRecord } from '../schema/lobby';
import type { LobbyMemberRecord } from '../schema/lobby-member';
import type { VersionedRecord } from '../schema/versioned';

export class LobbyStorageAdapter extends VersionedStorage {
	async createLobby<TConfig extends Payload>(
		gameConfig: TConfig,
		hostId: string,
		minPlayers: number,
		maxPlayers: number,
		userIds: string[],
	): Promise<Lobby<TConfig>> {
		const lobbyId = this.generateId();
		const lobbyData: Omit<LobbyRecord, keyof VersionedRecord> = {
			code: getRandomCode(),
			config: gameConfig,
			hostId: hostId,
			minPlayers: minPlayers,
			maxPlayers: maxPlayers,
			status: 'waiting' satisfies LobbyStatus,
		};
		const lobbyInsert = this.prepareInsert(TABLES.LOBBIES, lobbyId, lobbyData);

		const lobbyMembersData: Omit<LobbyMemberRecord, keyof VersionedRecord>[] =
			userIds.map((userId) => ({
				lobbyId,
				userId,
				status: 'in_lobby' satisfies LobbyMemberStatus,
			}));
		const lobbyMemberInserts = lobbyMembersData.map((lm) =>
			this.prepareInsert(
				TABLES.LOBBY_MEMBERS,
				LobbyMemberMapper.lobbyMemberId({ lobbyId, userId: lm.userId }),
				lm,
			),
		);

		await this.dataSource.performAtomic([
			// create lobby
			lobbyInsert,
			// create lobby members
			...lobbyMemberInserts,
		]);

		const profileRecords = await this.dataSource.performGetMany(
			TABLES.PROFILES,
			userIds,
		);

		const lobbyRecord = lobbyInsert.data;
		const lobbyMemberRecordsWithPublicUserInfo = lobbyMemberInserts.map(
			({ data }) => {
				// biome-ignore lint/style/noNonNullAssertion: no need to check
				const { displayName, avatarUrl } = profileRecords.find(
					(p) => p.id === data.userId,
				)!;
				return {
					lobbyMemberRecord: data,
					publicUserInfo: { displayName, avatarUrl },
				};
			},
		);

		return LobbyMapper.toDomain({
			lobbyRecord,
			lobbyMemberRecordsWithPublicUserInfo,
		});
	}

	private async hydrateLobby<TConfig extends Payload>(
		lobbyRecord: LobbyRecord,
	): Promise<Lobby<TConfig>> {
		const lobbyMemberRecords = await this.dataSource.performGetManyByField(
			TABLES.LOBBY_MEMBERS,
			'lobbyId',
			lobbyRecord.id,
		);
		const profileRecords = await this.dataSource.performGetMany(
			TABLES.PROFILES,
			lobbyMemberRecords.map((lm) => lm.userId),
		);

		const lobbyMemberRecordsWithPublicUserInfo = lobbyMemberRecords.map(
			(lobbyMemberRecord) => {
				const profileRecord = profileRecords.find(
					(pr) => pr.id === lobbyMemberRecord.userId,
				);
				if (!profileRecord) {
					throw new Error(
						`Profile not found for userId: ${lobbyMemberRecord.userId}`,
					);
				}
				return {
					lobbyMemberRecord,
					publicUserInfo: {
						displayName: profileRecord.displayName,
						avatarUrl: profileRecord.avatarUrl,
					},
				};
			},
		);

		return LobbyMapper.toDomain({
			lobbyRecord,
			lobbyMemberRecordsWithPublicUserInfo,
		});
	}

	async getLobby<TConfig extends Payload>(
		lobbyId: string,
	): Promise<Lobby<TConfig> | null> {
		const lobbyRecord = await this.dataSource.performGet(
			TABLES.LOBBIES,
			lobbyId,
		);
		if (!lobbyRecord) {
			return null;
		}

		return this.hydrateLobby(lobbyRecord);
	}

	async getLobbies<TConfig extends Payload>() {
		const lobbyRecords = await this.dataSource.performGetAll(TABLES.LOBBIES);
		return Promise.all(
			lobbyRecords.map((lobbyRecord) =>
				this.hydrateLobby<TConfig>(lobbyRecord),
			),
		);
	}

	async updateLobby<TConfig extends Payload>(
		lobby: Lobby<TConfig>,
	): Promise<void> {
		const { lobbyRecord, lobbyMemberRecordsWithPublicUserInfo } =
			LobbyMapper.toRecord(lobby);

		await this.dataSource.performAtomic([
			this.prepareUpdate(TABLES.LOBBIES, lobbyRecord),
			...lobbyMemberRecordsWithPublicUserInfo.map(({ lobbyMemberRecord }) =>
				this.prepareUpdate(TABLES.LOBBY_MEMBERS, lobbyMemberRecord),
			),
		]);
	}

	async deleteLobby(lobbyId: string): Promise<void> {
		await this.dataSource.performDelete(TABLES.LOBBIES, lobbyId);
	}
}
