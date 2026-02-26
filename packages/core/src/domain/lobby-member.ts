import type { PublicUserInfo } from './user';
import type { VersionedEntity } from './versioned';

export type LobbyMemberStatus = 'in_lobby' | 'ready' | 'synced';

export type LobbyMember = VersionedEntity &
	PublicUserInfo & {
		userId: string;
		lobbyId: string;

		status: LobbyMemberStatus;
	};
