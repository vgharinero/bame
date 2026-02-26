// engine/storage/mappers/game.ts

import type { Game, GameStatus, Turn } from '../../domain';
import type { PublicUserInfo } from '../../domain/user';
import type { Payload, PayloadMap, Serializable } from '../../primitives';
import type { GameRecord } from '../schema/game';
import type { PlayerRecord } from '../schema/player';
import { PlayerMapper } from './player';

export type GameMapperDto = {
	gameRecord: GameRecord;
	playerRecordsWithPublicUserInfo: {
		playerRecord: PlayerRecord;
		publicUserInfo: PublicUserInfo;
	}[];
};

export namespace GameMapper {
	// Full
	export function toDomain<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivate extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		dto: GameMapperDto,
	): Game<TConfig, TPublicState, TPrivate, TActionPayloadMap, TPhasePayloadMap>;

	// Partial
	export function toDomain<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivate extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		partialGameRecord: Partial<GameRecord>,
	): Partial<
		Game<TConfig, TPublicState, TPrivate, TActionPayloadMap, TPhasePayloadMap>
	>;

	// Implementation
	export function toDomain<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivate extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		input: GameMapperDto | Partial<GameRecord>,
	):
		| Game<TConfig, TPublicState, TPrivate, TActionPayloadMap, TPhasePayloadMap>
		| Partial<
				Game<
					TConfig,
					TPublicState,
					TPrivate,
					TActionPayloadMap,
					TPhasePayloadMap
				>
		  > {
		// Full
		if ('gameRecord' in input && 'playerRecordsWithPublicUserInfo' in input) {
			const { gameRecord, playerRecordsWithPublicUserInfo } = input;
			return {
				id: gameRecord.id,
				version: gameRecord.version,
				createdAt: gameRecord.createdAt,
				updatedAt: gameRecord.updatedAt,
				status: gameRecord.status as GameStatus,
				config: gameRecord.config as TConfig,
				seed: gameRecord.seed,
				state: gameRecord.publicState as TPublicState,
				players: playerRecordsWithPublicUserInfo.map((p) =>
					PlayerMapper.toDomain(p.playerRecord, p.publicUserInfo),
				),
				turn: gameRecord.currentTurn as Turn<
					TActionPayloadMap,
					TPhasePayloadMap
				>,
				winner: gameRecord.winnerId,
				startedAt: gameRecord.startedAt,
				finishedAt: gameRecord.finishedAt,
			};
		}

		// Partial
		const partialGameRecord = input as Partial<GameRecord>;
		const result: Partial<
			Game<TConfig, TPublicState, TPrivate, TActionPayloadMap, TPhasePayloadMap>
		> = {};

		if (partialGameRecord.id !== undefined) result.id = partialGameRecord.id;
		if (partialGameRecord.version !== undefined)
			result.version = partialGameRecord.version;
		if (partialGameRecord.createdAt !== undefined)
			result.createdAt = partialGameRecord.createdAt;
		if (partialGameRecord.updatedAt !== undefined)
			result.updatedAt = partialGameRecord.updatedAt;
		if (partialGameRecord.status !== undefined)
			result.status = partialGameRecord.status as GameStatus;
		if (partialGameRecord.config !== undefined)
			result.config = partialGameRecord.config as TConfig;
		if (partialGameRecord.seed !== undefined)
			result.seed = partialGameRecord.seed;
		if (partialGameRecord.publicState !== undefined)
			result.state = partialGameRecord.publicState as TPublicState;
		if (partialGameRecord.currentTurn !== undefined)
			result.turn = partialGameRecord.currentTurn as Turn<
				TActionPayloadMap,
				TPhasePayloadMap
			>;
		if (partialGameRecord.winnerId !== undefined)
			result.winner = partialGameRecord.winnerId;
		if (partialGameRecord.startedAt !== undefined)
			result.startedAt = partialGameRecord.startedAt;
		if (partialGameRecord.finishedAt !== undefined)
			result.finishedAt = partialGameRecord.finishedAt;

		return result;
	}

	// Implementation
	export const toRecord = <
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivate extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		game: Game<
			TConfig,
			TPublicState,
			TPrivate,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
	): GameMapperDto => {
		return {
			gameRecord: {
				id: game.id,
				version: game.version,
				createdAt: game.createdAt,
				updatedAt: game.updatedAt,
				status: game.status,
				config: game.config as Serializable,
				seed: game.seed,
				publicState: game.state as Serializable,
				currentTurn: game.turn as Serializable,
				winnerId: game.winner,
				startedAt: game.startedAt,
				finishedAt: game.finishedAt,
			},
			playerRecordsWithPublicUserInfo: game.players.map((p) => ({
				playerRecord: PlayerMapper.toRecord(p),
				publicUserInfo: {
					id: p.id.userId,
					displayName: p.displayName,
					avatarUrl: p.avatarUrl,
				},
			})),
		};
	};
}
