export type PublicUserInfo = {
	displayName: string;
	avatarUrl: string | null;
};

export type User = PublicUserInfo & {
	id: string;
};
