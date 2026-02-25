import {
	beforeEach,
	describe,
	expect,
	it,
	type MockedFunction,
	vi,
} from 'vitest';
import type { DomainEvent } from '../../domain';
import {
	type ApplyEventFn,
	type FetchFullStateFn,
	type StateChangeFn,
	StateSynchronizer,
} from './state-synchronizer';

type TestState = { value: number };
type TestEvent = DomainEvent<'test_event', { delta: number }>;

describe('StateSynchronizer', () => {
	let synchronizer: StateSynchronizer<TestState, TestEvent>;
	let onFetchFullState: MockedFunction<FetchFullStateFn<TestState>>;
	let onApplyEvent: MockedFunction<ApplyEventFn<TestState, TestEvent>>;
	let onStateChange: MockedFunction<StateChangeFn<TestState>>;

	beforeEach(() => {
		onFetchFullState = vi.fn();
		onApplyEvent = vi.fn();
		onStateChange = vi.fn();

		synchronizer = new StateSynchronizer({
			onFetchFullState,
			onApplyEvent,
			onStateChange,
		});
	});

	describe('handleIncomingEvent', () => {
		it('should process sequential events correctly', () => {
			const event1: TestEvent = {
				type: 'test_event',
				version: 1,
				payload: { delta: 5 },
			};
			const event2: TestEvent = {
				type: 'test_event',
				version: 2,
				payload: { delta: 10 },
			};

			onApplyEvent.mockReturnValueOnce({ value: 5 });
			onApplyEvent.mockReturnValueOnce({ value: 15 });

			synchronizer.handleIncomingEvent(event1);
			synchronizer.handleIncomingEvent(event2);

			expect(onApplyEvent).toHaveBeenCalledTimes(2);
			expect(onApplyEvent).toHaveBeenNthCalledWith(1, null, event1);
			expect(onApplyEvent).toHaveBeenNthCalledWith(2, null, event2);
			expect(onStateChange).toHaveBeenCalledTimes(2);
			expect(onStateChange).toHaveBeenNthCalledWith(1, { value: 5 });
			expect(onStateChange).toHaveBeenNthCalledWith(2, { value: 15 });
		});

		it('should ignore old events', () => {
			const event1: TestEvent = {
				type: 'test_event',
				version: 5,
				payload: { delta: 5 },
			};
			const event2: TestEvent = {
				type: 'test_event',
				version: 3,
				payload: { delta: 10 },
			};

			onApplyEvent.mockReturnValue({ value: 5 });

			synchronizer.handleIncomingEvent(event1);
			synchronizer.handleIncomingEvent(event2);

			expect(onApplyEvent).toHaveBeenCalledTimes(1);
			expect(onStateChange).toHaveBeenCalledTimes(1);
		});

		it('should ignore duplicate events', () => {
			const event: TestEvent = {
				type: 'test_event',
				version: 1,
				payload: { delta: 5 },
			};

			onApplyEvent.mockReturnValue({ value: 5 });

			synchronizer.handleIncomingEvent(event);
			synchronizer.handleIncomingEvent(event);

			expect(onApplyEvent).toHaveBeenCalledTimes(1);
			expect(onStateChange).toHaveBeenCalledTimes(1);
		});

		it('should trigger recovery on version gap', () => {
			const event1: TestEvent = {
				type: 'test_event',
				version: 1,
				payload: { delta: 5 },
			};
			const event3: TestEvent = {
				type: 'test_event',
				version: 3,
				payload: { delta: 10 },
			};

			onApplyEvent.mockReturnValue({ value: 5 });
			onFetchFullState.mockResolvedValue({
				state: { value: 20 },
				version: 3,
			});

			synchronizer.handleIncomingEvent(event1);
			synchronizer.handleIncomingEvent(event3);

			expect(onFetchFullState).toHaveBeenCalledTimes(1);
			expect(onApplyEvent).toHaveBeenCalledTimes(1);
		});

		it('should not trigger recovery for version difference of 1', () => {
			const event1: TestEvent = {
				type: 'test_event',
				version: 1,
				payload: { delta: 5 },
			};
			const event2: TestEvent = {
				type: 'test_event',
				version: 2,
				payload: { delta: 10 },
			};

			onApplyEvent.mockReturnValue({ value: 5 });

			synchronizer.handleIncomingEvent(event1);
			synchronizer.handleIncomingEvent(event2);

			expect(onFetchFullState).not.toHaveBeenCalled();
		});
	});

	describe('recover', () => {
		it('should fetch full state and update version', async () => {
			const fullState = { value: 100 };
			onFetchFullState.mockResolvedValue({
				state: fullState,
				version: 10,
			});

			await synchronizer.recover();

			expect(onFetchFullState).toHaveBeenCalledTimes(1);
			expect(onStateChange).toHaveBeenCalledWith(fullState);
		});

		it('should update lastVersion after recovery', async () => {
			onFetchFullState.mockResolvedValue({
				state: { value: 100 },
				version: 10,
			});

			await synchronizer.recover();

			const newEvent: TestEvent = {
				type: 'test_event',
				version: 9,
				payload: { delta: 5 },
			};

			synchronizer.handleIncomingEvent(newEvent);

			expect(onApplyEvent).not.toHaveBeenCalled();
		});

		it('should accept events after recovery', async () => {
			onFetchFullState.mockResolvedValue({
				state: { value: 100 },
				version: 5,
			});
			onApplyEvent.mockReturnValue({ value: 110 });

			await synchronizer.recover();

			const newEvent: TestEvent = {
				type: 'test_event',
				version: 6,
				payload: { delta: 10 },
			};

			synchronizer.handleIncomingEvent(newEvent);

			expect(onApplyEvent).toHaveBeenCalledWith(null, newEvent);
			expect(onStateChange).toHaveBeenCalledWith({ value: 110 });
		});
	});
});
