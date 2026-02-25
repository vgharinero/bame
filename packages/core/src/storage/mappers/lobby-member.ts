import type {
	LobbyMember,
	LobbyMemberStatus,
	PublicUserInfo,
} from '../../domain';
import type { LobbyMemberRecord } from '../schema/lobby-member';

export namespace LobbyMemberMapper {
	export const toDomain = (
		lobbyMemberRecord: LobbyMemberRecord,
		publicUserInfo: PublicUserInfo,
	): LobbyMember => {
		return {
			id: {
				lobbyId: lobbyMemberRecord.lobbyId,
				userId: lobbyMemberRecord.userId,
			},
			version: lobbyMemberRecord.version,
			createdAt: lobbyMemberRecord.createdAt,
			updatedAt: lobbyMemberRecord.updatedAt,
			status: lobbyMemberRecord.status as LobbyMemberStatus,
			displayName: publicUserInfo.displayName,
			avatarUrl: publicUserInfo.avatarUrl,
		};
	};

	export const lobbyMemberId = (id: LobbyMember['id']) =>
		`${id.lobbyId}.${id.userId}`;

	export const toRecord = (lobbyMember: LobbyMember): LobbyMemberRecord => {
		return {
			id: lobbyMemberId(lobbyMember.id),
			version: lobbyMember.version,
			createdAt: lobbyMember.createdAt,
			updatedAt: lobbyMember.updatedAt,
			lobbyId: lobbyMember.id.lobbyId,
			userId: lobbyMember.id.userId,
			status: lobbyMember.status,
		};
	};
}
