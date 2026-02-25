import type { Player, PlayerStatus, PublicUserInfo } from '../../domain';
import type { Payload, Serializable } from '../../primitives';
import type { PlayerRecord } from '../schema/player';

export namespace PlayerMapper {
	export const toDomain = <TPrivateState extends Payload>(
		playerRecord: PlayerRecord,
		publicUserInfo: PublicUserInfo,
	): Player<TPrivateState> => {
		return {
			id: { gameId: playerRecord.gameId, userId: playerRecord.userId },
			version: playerRecord.version,
			createdAt: playerRecord.createdAt,
			updatedAt: playerRecord.updatedAt,
			status: playerRecord.status as PlayerStatus,
			privateState: playerRecord.privateState as TPrivateState,
			displayName: publicUserInfo.displayName,
			avatarUrl: publicUserInfo.avatarUrl,
		};
	};

	export const playerId = (id: Player[`id`]) => `${id.gameId}:${id.userId}`;

	export const toRecord = <TPrivateState extends Payload>(
		player: Player<TPrivateState>,
	): PlayerRecord => {
		return {
			id: playerId(player.id),
			version: player.version,
			createdAt: player.createdAt,
			updatedAt: player.updatedAt,
			status: player.status,
			gameId: player.id.gameId,
			userId: player.id.userId,
			privateState: player.privateState as Serializable,
		};
	};
}
