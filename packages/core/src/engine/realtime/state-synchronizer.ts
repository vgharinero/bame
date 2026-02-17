import type { RealtimeEvent } from '../types';

export class StateSynchronizer<
	TState,
	TType extends string,
	TPayload,
	TEvent extends RealtimeEvent<TType, TPayload>,
> {
	private lastVersion: number = 0;

	constructor(
		private options: {
			onFetchFullState: () => Promise<{ state: TState; version: number }>;
			onApplyEvent: (currentState: TState | null, event: TEvent) => TState;
			onStateChange: (state: TState) => void;
		},
	) {}

	public handleIncomingEvent(event: TEvent) {
		// 1. Check for missed messages
		if (event.version > this.lastVersion + 1) {
			console.warn(
				`Version gap detected: ${this.lastVersion} -> ${event.version}. Recovering...`,
			);
			this.recover();
			return;
		}

		// 2. Ignore old messages
		if (event.version <= this.lastVersion) return;

		// 3. Update version and state
		this.lastVersion = event.version;
		this.options.onStateChange(this.options.onApplyEvent(null, event));
	}

	public async recover() {
		const { state, version } = await this.options.onFetchFullState();
		this.lastVersion = version;
		this.options.onStateChange(state);
	}
}
