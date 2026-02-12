import { createContext, useContext } from 'react';
import type { User } from '../../engine/types/profile';

export interface AuthContextValue {
	user: User | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (
		email: string,
		password: string,
		displayName: string,
	) => Promise<void>;
	signOut: () => Promise<void>;
	updateAvatar: (avatarUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) throw new Error('useAuth must be used within AuthProvider');
	return context;
};

export { AuthContext };
