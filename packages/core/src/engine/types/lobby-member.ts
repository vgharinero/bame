import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned-entity';

export type LobbyMemberStatus = 'in_lobby' | 'ready' | 'synced';

export type MemberId = { lobbyId: string; userId: string };

export interface LobbyMember extends VersionedEntity<MemberId>, PublicUserInfo {
	status: LobbyMemberStatus;
}
