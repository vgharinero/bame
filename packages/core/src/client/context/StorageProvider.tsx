import { createContext, useContext } from 'react';
import type {
	IGameStorage,
	ILobbyStorage,
	IProfileStorage,
	IRealtimeStorage,
} from '../../storage';

export interface StorageContextValue {
	profileStorage: IProfileStorage;
	lobbyStorage: ILobbyStorage;
	gameStorage: IGameStorage;
	realtimeStorage: IRealtimeStorage;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export const useStorage = () => {
	const context = useContext(StorageContext);
	if (!context)
		throw new Error('useStorage must be used within StorageProvider');
	return context;
};

export { StorageContext };
