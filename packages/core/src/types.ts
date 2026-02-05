export type EngineContext = {
    actorId: string;
    now: number;
};

export type ReduceResult<State> = {
    state: State;
    nextTurnActorId: string;
    status?: "active" | "finished";
};

export interface GameDefinition<State, Action> {
    parseAction(input: unknown): Action;
    createInitialState(params: { playerIds: string[]; seed?: string }): State;
    reduce(state: State, action: Action, ctx: EngineContext): ReduceResult<State>;
}

