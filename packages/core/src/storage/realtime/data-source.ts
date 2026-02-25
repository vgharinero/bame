import type { DomainEvent } from '../../domain';

export type RealtimeChannel =
	| `game:${string}`
	| `game:${string}:${string}`
	| `lobby:${string}`
	| `profile:${string}`
	| 'lobbies';

export interface RealtimeDataSource {
	subscribe<TRecordEvent extends DomainEvent>(
		channel: RealtimeChannel,
		callback: (event: TRecordEvent) => void | Promise<void>,
	): Promise<void>;

	unsubscribe(channel: RealtimeChannel): Promise<void>;

	broadcast<TRecordEvent extends DomainEvent>(
		channel: RealtimeChannel,
		event: TRecordEvent,
	): Promise<void>;

	unsubscribeAll(): Promise<void>;
}
