export interface PublicUserInfo {
	displayName: string;
	avatarUrl: string | null;
}

export interface User extends PublicUserInfo {
	id: string;
}
