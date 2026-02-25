import type {
	DomainEvent,
	GameDomainEvent,
	LobbiesDomainEvent,
	LobbyDomainEvent,
	ProfileDomainEvent,
} from '../../domain';
import type { Payload, PayloadMap } from '../../primitives';
import type { RealtimeChannel, RealtimeDataSource } from './data-source';

export type RealtimeCallback<
	TDomainEvent extends DomainEvent<string, Payload | undefined>,
> = (event: TDomainEvent) => void | Promise<void>;

export class RealtimeAdapter {
	constructor(private readonly dataSource: RealtimeDataSource) {}

	async subscribeProfile(
		userId: string,
		callback: RealtimeCallback<ProfileDomainEvent>,
	): Promise<void> {
		const channel: RealtimeChannel = `profile:${userId}`;
		await this.dataSource.subscribe<ProfileDomainEvent>(channel, callback);
	}

	async unsubscribeProfile(userId: string): Promise<void> {
		const channel: RealtimeChannel = `profile:${userId}`;
		await this.dataSource.unsubscribe(channel);
	}

	async broadcastProfileEvent(
		userId: string,
		event: ProfileDomainEvent,
	): Promise<void> {
		const channel: RealtimeChannel = `profile:${userId}`;
		await this.dataSource.broadcast(channel, event);
	}

	async subscribeLobby<TConfig extends Payload>(
		lobbyId: string,
		callback: RealtimeCallback<LobbyDomainEvent<TConfig>>,
	): Promise<void> {
		const channel: RealtimeChannel = `lobby:${lobbyId}`;
		await this.dataSource.subscribe(channel, callback);
	}

	async unsubscribeLobby(lobbyId: string): Promise<void> {
		const channel: RealtimeChannel = `lobby:${lobbyId}`;
		await this.dataSource.unsubscribe(channel);
	}

	async broadcastLobbyEvent<TConfig extends Payload>(
		lobbyId: string,
		event: LobbyDomainEvent<TConfig>,
	): Promise<void> {
		const channel: RealtimeChannel = `lobby:${lobbyId}`;
		await this.dataSource.broadcast(channel, event);
	}

	async subscribeLobbies(
		callback: RealtimeCallback<LobbiesDomainEvent>,
	): Promise<void> {
		const channel: RealtimeChannel = 'lobbies';
		await this.dataSource.subscribe(channel, callback);
	}

	async unsubscribeLobbies(): Promise<void> {
		const channel: RealtimeChannel = 'lobbies';
		await this.dataSource.unsubscribe(channel);
	}

	async broadcastLobbiesEvent(event: LobbiesDomainEvent): Promise<void> {
		const channel: RealtimeChannel = 'lobbies';
		await this.dataSource.broadcast(channel, event);
	}

	async subscribeGame<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		gameId: string,
		callback: RealtimeCallback<
			GameDomainEvent<
				TConfig,
				TPublicState,
				TPrivateState,
				TActionPayloadMap,
				TPhasePayloadMap
			>
		>,
	): Promise<void> {
		const channel: RealtimeChannel = `game:${gameId}`;
		await this.dataSource.subscribe(channel, callback);
	}

	async unsubscribeGame(gameId: string): Promise<void> {
		const channel: RealtimeChannel = `game:${gameId}`;
		await this.dataSource.unsubscribe(channel);
	}

	async broadcastGameEvent<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		gameId: string,
		event: GameDomainEvent<
			TConfig,
			TPublicState,
			TPrivateState,
			TActionPayloadMap,
			TPhasePayloadMap
		>,
	): Promise<void> {
		const channel: RealtimeChannel = `game:${gameId}`;
		await this.dataSource.broadcast(channel, event);
	}

	async subscribeClientGame<
		TConfig extends Payload,
		TPublicState extends Payload,
		TPrivateState extends Payload,
		TActionPayloadMap extends PayloadMap,
		TPhasePayloadMap extends PayloadMap,
	>(
		gameId: string,
		userId: string,
		callback: RealtimeCallback<
			GameDomainEvent<
				TConfig,
				TPublicState,
				TPrivateState,
				TActionPayloadMap,
				TPhasePayloadMap
			>
		>,
	): Promise<void> {
		const channel: RealtimeChannel = `game:${gameId}:${userId}`;
		await this.dataSource.subscribe(channel, callback);
	}

	async unsubscribeClientGame(gameId: string, userId: string): Promise<void> {
		const channel: RealtimeChannel = `game:${gameId}:${userId}`;
		await this.dataSource.unsubscribe(channel);
	}
}
