export interface User {
	id: string;
	displayName: string;
	avatarUrl: string | null;
}

export interface Profile extends User {
	wins: number;
	losses: number;
	draws: number;
	totalGames: number;
	winRate: number;
	createdAt: number;
	updatedAt: number;
}
