'use client';

import { useEffect, useState } from 'react';
import { useGame } from './useGame';

export interface UseGameSyncReturn {
	isSyncing: boolean;
	isBlocked: boolean; // Should UI be blocked?
	syncMessage: string | null;
}

export const useGameSync = (gameId?: string): UseGameSyncReturn => {
	const { game, isLoading } = useGame(gameId);
	const [isSyncing, setIsSyncing] = useState(false);

	const status = game?.status;

	useEffect(() => {
		if (!status) {
			setIsSyncing(false);
			return;
		}

		// Detect critical transitions that require sync
		const isTransitioning = status === 'waiting' || status === 'starting';

		setIsSyncing(isTransitioning);
	}, [status]);

	const isBlocked = isLoading || isSyncing;

	const syncMessage = isLoading
		? 'Loading game...'
		: game?.status === 'starting'
			? 'Starting game...'
			: game?.status === 'waiting'
				? 'Waiting for players...'
				: null;

	return {
		isSyncing,
		isBlocked,
		syncMessage,
	};
};
