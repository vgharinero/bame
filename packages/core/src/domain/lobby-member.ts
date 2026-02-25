import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned';

export type LobbyMemberStatus = 'in_lobby' | 'ready' | 'synced';

export type MemberId = { lobbyId: string; userId: string };

export type LobbyMember = VersionedEntity<MemberId> &
	PublicUserInfo & {
		status: LobbyMemberStatus;
	};
