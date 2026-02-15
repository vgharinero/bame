import type { User } from './profile';

export type PlayerStatus = 'syncing' | 'active' | 'eliminated' | 'disconnected';

export interface Player<TPrivateState extends object = object> extends User {
	status: PlayerStatus;
	privateState: TPrivateState;
	joinedAt: number;
}
