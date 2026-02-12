export interface Action<
	TType extends string = string,
	TPayload extends object = object,
> {
	type: TType;
	playerId: string;
	payload: TPayload;
	timestamp: number;
	advancesPhase?: boolean;
	requiredPhase?: string;
}

export type ActionResult<TState extends object = object> = {
	success: boolean;
	newState?: TState;
	error?: string;
};
