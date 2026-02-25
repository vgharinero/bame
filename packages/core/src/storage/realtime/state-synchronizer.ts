import type { DomainEvent } from '../../domain';

export type FetchFullStateFn<TState extends object> = () => Promise<{
	state: TState;
	version: number;
}>;

export type ApplyEventFn<TState extends object, TEvent extends DomainEvent> = (
	currentState: TState | null,
	event: TEvent,
) => TState;

export type StateChangeFn<TState extends object> = (state: TState) => void;

export type StateSynchronizerOptions<
	TState extends object,
	TEvent extends DomainEvent,
> = {
	onFetchFullState: FetchFullStateFn<TState>;
	onApplyEvent: ApplyEventFn<TState, TEvent>;
	onStateChange: StateChangeFn<TState>;
};

export class StateSynchronizer<
	TState extends object,
	TEvent extends DomainEvent,
> {
	private lastVersion: number = 0;

	constructor(private options: StateSynchronizerOptions<TState, TEvent>) {}

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
