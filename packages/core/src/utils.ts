import type { GameAction } from "./types";

export const getNextPlayer = (players: string[], current: string): string => {
    const idx = players.indexOf(current);
    return players[(idx + 1) % players.length];
};

export const getPreviousPlayer = (players: string[], current: string): string => {
    const idx = players.indexOf(current);
    return players[(idx - 1 + players.length) % players.length];
};


export const createAction = <A extends GameAction>(
    type: A['type'],
    payload: A['payload'],
    playerId: string
): A => ({
    type,
    payload,
    playerId,
    timestamp: Date.now(),
} as A);