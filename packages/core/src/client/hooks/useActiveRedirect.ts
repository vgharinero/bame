'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth, useStorage } from '../context';

export interface ActiveSession {
	type: 'lobby' | 'game';
	id: string;
}

const SKIP_REDIRECT_KEY = 'skipAutoRedirect';

export const useActiveRedirect = (): {
	activeSession: ActiveSession | null;
	isChecking: boolean;
	skipRedirect: () => void;
} => {
	const { user } = useAuth();
	const { lobbyStorage } = useStorage();
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(
		null,
	);
	const [isChecking, setIsChecking] = useState(true);
	const hasChecked = useRef(false);

	useEffect(() => {
		if (!user || hasChecked.current) {
			setIsChecking(false);
			return;
		}

		// Check if we should skip auto-redirect (e.g., after leaving a lobby)
		const shouldSkip = sessionStorage.getItem(SKIP_REDIRECT_KEY);
		if (shouldSkip) {
			sessionStorage.removeItem(SKIP_REDIRECT_KEY);
			setIsChecking(false);
			hasChecked.current = true;
			return;
		}

		const checkActiveSession = async () => {
			try {
				const userLobbies = await lobbyStorage.getUserLobbies(user.id, {
					status: ['waiting', 'ready', 'starting', 'transitioned'],
				});

				if (userLobbies.length > 0) {
					const mostRecent = userLobbies.sort(
						(a, b) => b.updatedAt - a.updatedAt,
					)[0];

					if (mostRecent.status === 'transitioned') {
						setActiveSession({ type: 'game', id: mostRecent.id });
					} else {
						setActiveSession({ type: 'lobby', id: mostRecent.id });
					}
				}
			} catch (err) {
				console.error('Failed to check active session:', err);
			} finally {
				setIsChecking(false);
				hasChecked.current = true;
			}
		};

		checkActiveSession();
	}, [user, lobbyStorage]);

	const skipRedirect = () => {
		sessionStorage.setItem(SKIP_REDIRECT_KEY, 'true');
	};

	return { activeSession, isChecking, skipRedirect };
};
