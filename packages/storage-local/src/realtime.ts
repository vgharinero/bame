import EventEmitter from 'node:events';
import type { DomainEvent } from '@bame/core';
import type { RealtimeChannel, RealtimeDataSource } from '@bame/core/storage';

export class LocalRealtimeDataSource implements RealtimeDataSource {
	private emitter = new EventEmitter();

	// Keep track of what channels have active listeners to allow a clean unsubscribeAll down the road
	private activeChannels = new Set<string>();

	async subscribe<TRecordEvent extends DomainEvent>(
		channel: RealtimeChannel,
		callback: (event: TRecordEvent) => void | Promise<void>,
	): Promise<void> {
		this.activeChannels.add(channel);
		this.emitter.on(channel, callback);
	}

	async unsubscribe(channel: RealtimeChannel): Promise<void> {
		this.emitter.removeAllListeners(channel);
		this.activeChannels.delete(channel);
	}

	async broadcast<TRecordEvent extends DomainEvent>(
		channel: RealtimeChannel,
		event: TRecordEvent,
	): Promise<void> {
		this.emitter.emit(channel, event);
	}

	async unsubscribeAll(): Promise<void> {
		for (const channel of this.activeChannels) {
			this.emitter.removeAllListeners(channel);
		}
		this.activeChannels.clear();
	}
}
