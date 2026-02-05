import type { EngineContext, GameDefinition, ReduceResult } from "./types";
import { validateTurn } from "./validation";

export type ApplyActionResult<State> =
    | { success: true; result: ReduceResult<State> }
    | { success: false; error: string };

/**
 * Apply an action to the game state with full validation.
 * Orchestrates: turn validation → action parsing → reduce
 */
export const applyAction = <State, Action>(
    game: GameDefinition<State, Action>,
    state: State,
    currentTurnActorId: string,
    actorId: string,
    rawAction: unknown
): ApplyActionResult<State> => {
    // 1. Validate turn
    const turnCheck = validateTurn(actorId, currentTurnActorId);
    if (!turnCheck.valid) {
        return { success: false, error: turnCheck.reason };
    }

    // 2. Parse action
    let action: Action;
    try {
        action = game.parseAction(rawAction);
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Invalid action" };
    }

    // 3. Apply reduce
    const ctx: EngineContext = { actorId, now: Date.now() };
    const result = game.reduce(state, action, ctx);

    return { success: true, result };
};

