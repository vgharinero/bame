export type TurnValidationResult =
    | { valid: true }
    | { valid: false; reason: string };

/**
 * Validate if an actor is allowed to take an action.
 */
export const validateTurn = (
    actorId: string,
    currentTurnActorId: string
): TurnValidationResult => {
    if (actorId !== currentTurnActorId) {
        return { valid: false, reason: "Not your turn" };
    }
    return { valid: true };
};

