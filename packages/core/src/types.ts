export type BaseGameState = {
    status: 'lobby' | 'playing' | 'finished';
    turn: string;
    players: Record<string, unknown>;
}

export type GameAction<TType = string, TPayload = object> = {
    type: TType;
    payload: TPayload;
    playerId: string;
    timestamp: number;
}

export type EngineContext = {
    random: () => number;
    now: number;
}

export type GameDefinition<S extends BaseGameState, A extends GameAction> = {
    id: string;
    minPlayers: number;
    maxPlayers: number;
    initialState: (players: string[]) => S;
    reducer: (state: S, action: A, context?: EngineContext) => S;
    isGameOver: (state: S) => boolean;
    maskState?: (state: S, playerId: string) => S;
}