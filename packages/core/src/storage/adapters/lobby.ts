import type { Lobby, LobbyMember, LobbyMemberStatus } from '../../domain';
import type { Payload } from '../../primitives';
import { LobbyMapper, LobbyMemberMapper } from '../mappers';
import { VersionedStorage } from '../realtime/versioned-storage';
import { TABLES } from '../schema';
import type { LobbyRecord } from '../schema/lobby';
import type { LobbyMemberRecord } from '../schema/lobby-member';
import type { VersionedRecord } from '../schema/versioned';

export class LobbyStorageAdapter extends VersionedStorage {
	private async hydrateLobby<TConfig extends Payload>(
		lobbyRecord: LobbyRecord,
		_lobbyMemberRecords?: LobbyMemberRecord[],
	): Promise<Lobby<TConfig>> {
		const lobbyMemberRecords =
			_lobbyMemberRecords ??
			(await this.dataSource.performGetManyByField(
				TABLES.LOBBY_MEMBERS,
				'lobbyId',
				lobbyRecord.id,
			));
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

	private async hydrateLobbyMember(
		lobbyMemberRecord: LobbyMemberRecord,
	): Promise<LobbyMember> {
		const profileRecord = await this.dataSource.performGet(
			TABLES.PROFILES,
			lobbyMemberRecord.userId,
		);
		if (!profileRecord) {
			throw new Error('Profile not found for lobby member');
		}

		return LobbyMemberMapper.toDomain(lobbyMemberRecord, {
			displayName: profileRecord.displayName,
			avatarUrl: profileRecord.avatarUrl,
		});
	}

	async createLobby<TConfig extends Payload>(
		lobbyData: Omit<LobbyRecord, keyof VersionedRecord>,
		defaultMemberStatus: LobbyMemberStatus,
	): Promise<Lobby<TConfig>> {
		const lobbyId = this.generateId();
		const lobbyInsert = this.prepareInsert(TABLES.LOBBIES, lobbyId, lobbyData);

		const lobbyMemberInsert = this.prepareInsert(
			TABLES.LOBBY_MEMBERS,
			LobbyMemberMapper.lobbyMemberId({ lobbyId, userId: lobbyData.hostId }),
			{
				lobbyId,
				userId: lobbyData.hostId,
				status: defaultMemberStatus,
			},
		);

		await this.dataSource.performAtomic([
			// create lobby
			lobbyInsert,
			// create host member
			lobbyMemberInsert,
		]);

		const lobbyRecord = lobbyInsert.record;
		return this.hydrateLobby<TConfig>(lobbyRecord, [lobbyMemberInsert.record]);
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

	async getLobbyByCode<TConfig extends Payload>(
		code: string,
	): Promise<Lobby<TConfig> | null> {
		const lobbyRecord = await this.dataSource.performGetByField(
			TABLES.LOBBIES,
			'code',
			code,
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

	async createLobbyMember(
		lobbyMemberData: Omit<LobbyMemberRecord, keyof VersionedRecord>,
	): Promise<LobbyMember> {
		const lobbyMemberRecord = await this.insertVersionedRecord(
			TABLES.LOBBY_MEMBERS,
			LobbyMemberMapper.lobbyMemberId(lobbyMemberData),
			lobbyMemberData,
		);

		return this.hydrateLobbyMember(lobbyMemberRecord);
	}

	async updateLobbyMember(lobbyMember: LobbyMember): Promise<void> {
		const lobbyMemberRecord = LobbyMemberMapper.toRecord(lobbyMember);
		await this.updateVersionedRecord(TABLES.LOBBY_MEMBERS, lobbyMemberRecord);
	}

	async deleteLobbyMember(lobbyId: string, userId: string): Promise<void> {
		const lobbyMemberId = LobbyMemberMapper.lobbyMemberId({ lobbyId, userId });
		await this.dataSource.performDelete(TABLES.LOBBY_MEMBERS, lobbyMemberId);
	}
}
