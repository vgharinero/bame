import type { User } from './profile';

export type LobbyMemberStatus = 'in_lobby' | 'leaving' | 'in_game' | 'synced';

export interface LobbyMember extends User {
	lobbyId: string;
	status: LobbyMemberStatus;
	joinedAt: number;
}
