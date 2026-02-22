import type { Lobby, LobbyStatus, PublicUserInfo } from '../../domain';
import type { JsonValue, Payload } from '../../primitives';
import type { LobbyRecord } from '../schema/lobby';
import type { LobbyMemberRecord } from '../schema/lobby-member';
import { LobbyMemberMapper } from './lobby-member';

export type LobbyMapperDto = {
	lobbyRecord: LobbyRecord;
	lobbyMemberRecordsWithPublicUserInfo: {
		lobbyMemberRecord: LobbyMemberRecord;
		publicUserInfo: PublicUserInfo;
	}[];
};

export namespace LobbyMapper {
	export function toDomain<TConfig extends Payload>({
		lobbyRecord,
		lobbyMemberRecordsWithPublicUserInfo,
	}: LobbyMapperDto): Lobby<TConfig>;

	export function toDomain<TConfig extends Payload>(
		lobbyRecord: Partial<LobbyRecord>,
	): Partial<Lobby<TConfig>>;

	export function toDomain<TConfig extends Payload>(
		input: LobbyMapperDto | Partial<LobbyRecord>,
	): Lobby<TConfig> | Partial<Lobby<TConfig>> {
		// Full
		if (
			'lobbyRecord' in input &&
			'lobbyMemberRecordsWithPublicUserInfo' in input
		) {
			const { lobbyRecord, lobbyMemberRecordsWithPublicUserInfo } = input;
			return {
				id: lobbyRecord.id,
				version: lobbyRecord.version,
				createdAt: lobbyRecord.createdAt,
				updatedAt: lobbyRecord.updatedAt,
				code: lobbyRecord.code,
				hostId: lobbyRecord.hostId,
				status: lobbyRecord.status as LobbyStatus,
				members: lobbyMemberRecordsWithPublicUserInfo.map((lm) =>
					LobbyMemberMapper.toDomain(lm.lobbyMemberRecord, lm.publicUserInfo),
				),
				minPlayers: lobbyRecord.minPlayers,
				maxPlayers: lobbyRecord.maxPlayers,
				gameConfig: lobbyRecord.config as TConfig,
				transitionedAt: lobbyRecord.transitionedAt,
			};
		}

		const partialLobbyRecord = input as Partial<LobbyRecord>;
		const result: Partial<Lobby<TConfig>> = {};

		if (partialLobbyRecord.id !== undefined) result.id = partialLobbyRecord.id;
		if (partialLobbyRecord.version !== undefined)
			result.version = partialLobbyRecord.version;
		if (partialLobbyRecord.createdAt !== undefined)
			result.createdAt = partialLobbyRecord.createdAt;
		if (partialLobbyRecord.updatedAt !== undefined)
			result.updatedAt = partialLobbyRecord.updatedAt;
		if (partialLobbyRecord.code !== undefined)
			result.code = partialLobbyRecord.code;
		if (partialLobbyRecord.hostId !== undefined)
			result.hostId = partialLobbyRecord.hostId;
		if (partialLobbyRecord.status !== undefined)
			result.status = partialLobbyRecord.status as LobbyStatus;
		if (partialLobbyRecord.minPlayers !== undefined)
			result.minPlayers = partialLobbyRecord.minPlayers;
		if (partialLobbyRecord.maxPlayers !== undefined)
			result.maxPlayers = partialLobbyRecord.maxPlayers;
		if (partialLobbyRecord.config !== undefined)
			result.gameConfig = partialLobbyRecord.config as TConfig;
		if (partialLobbyRecord.transitionedAt !== undefined)
			result.transitionedAt = partialLobbyRecord.transitionedAt;

		return result;
	}

	export const toRecord = (lobby: Lobby): LobbyMapperDto => ({
		lobbyRecord: {
			id: lobby.id,
			version: lobby.version,
			createdAt: lobby.createdAt,
			updatedAt: lobby.updatedAt,
			code: lobby.code,
			hostId: lobby.hostId,
			status: lobby.status,
			config: lobby.gameConfig as JsonValue,
			minPlayers: lobby.minPlayers,
			maxPlayers: lobby.maxPlayers,
			transitionedAt: lobby.transitionedAt,
		},
		lobbyMemberRecordsWithPublicUserInfo: lobby.members.map((member) => ({
			lobbyMemberRecord: LobbyMemberMapper.toRecord(member),
			publicUserInfo: {
				displayName: member.displayName,
				avatarUrl: member.avatarUrl,
			},
		})),
	});
}
