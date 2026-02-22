'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
	AuthContext,
	type AuthContextValue,
	StorageContext,
	useAuth,
	useStorage,
} from '../../client/context';
import type { User } from '../../engine/types';
import { browserClient } from '../supabase/client/supabase-browser';
import {
	SupabaseGameStorage,
	SupabaseLobbyStorage,
	SupabaseProfileStorage,
	SupabaseRealtimeStorage,
} from '../supabase/storage';

export const Providers = ({
	children,
	url,
	publishableKey,
}: {
	children: ReactNode;
	url: string;
	publishableKey: string;
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [supabase] = useState(() => browserClient(url, publishableKey));

	useEffect(() => {
		// Get initial session
		supabase.auth.getSession().then(({ data: { session } }) => {
			setUser(session?.user ? mapAuthUser(session.user) : null);
			setIsLoading(false);
		});

		// Listen for auth changes
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setUser(session?.user ? mapAuthUser(session.user) : null);
		});

		return () => subscription.unsubscribe();
	}, [supabase]);

	const authValue: AuthContextValue = {
		user,
		isLoading,
		isAuthenticated: !!user,
		signIn: async (email: string, password: string) => {
			const { error } = await supabase.auth.signInWithPassword({
				email,
				password,
			});
			if (error) throw error;
		},
		signUp: async (email: string, password: string, displayName: string) => {
			const { error } = await supabase.auth.signUp({
				email,
				password,
				options: {
					data: { display_name: displayName },
				},
			});
			if (error) throw error;
		},
		signOut: async () => {
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
		},
		updateAvatar: async (avatarUrl: string) => {
			// This will be handled through profile storage
			throw new Error('Use useProfile hook for avatar updates');
		},
	};

	const storageValue = useMemo(
		() => ({
			profileStorage: new SupabaseProfileStorage(supabase),
			lobbyStorage: new SupabaseLobbyStorage(supabase),
			gameStorage: new SupabaseGameStorage(supabase),
			realtimeStorage: new SupabaseRealtimeStorage(supabase),
		}),
		[supabase],
	);

	return (
		<AuthContext.Provider value={authValue}>
			<StorageContext.Provider value={storageValue}>
				{children}
			</StorageContext.Provider>
		</AuthContext.Provider>
	);
};

export { useAuth, useStorage };

function mapAuthUser(user: any): User {
	return {
		id: user.id,
		displayName: user.user_metadata?.display_name || 'Player',
		avatarUrl: user.user_metadata?.avatar_url || null,
	};
}
