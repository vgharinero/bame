import { produce } from 'immer'; // Optional, but recommended for clean reducers
import type { BaseGameState, GameAction, EngineContext, GameDefinition } from './types';

/**
 * Applies a single action to the state and returns the new state.
 * Throws if the move is invalid.
 */
export const processAction = <S extends BaseGameState, A extends GameAction>(
    def: GameDefinition<S, A>,
    state: S,
    action: A,
    context: EngineContext
) => {
    if (state.status === 'finished') throw new Error("Game is over.");
    if (state.turn !== action.playerId) throw new Error("Not your turn!");

    const nextState = produce(state, (draft: S) => {
        return def.reducer(draft, action, context);
    });

    if (def.isGameOver(nextState)) {
        return {
            ...nextState,
            status: 'finished'
        };
    }

    return nextState;
}

/**
 * Replays a list of actions from an initial state to get the final state.
 * Useful for loading a game from the database (Event Sourcing).
 */
export const computeState = <S extends BaseGameState, A extends GameAction>(
    def: GameDefinition<S, A>,
    initialState: S,
    history: A[],
    context: EngineContext
) => {
    return history.reduce(
        (state, action) => processAction(def, state, action, context),
        initialState
    );
}