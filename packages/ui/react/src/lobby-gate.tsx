import type { Game, Lobby, LobbyMember, MoveMap } from '@bame/core';
import {
	createContext,
	type FormEvent,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from 'react';
import { useLobby } from './hooks.js';

export interface LobbyGateContextValue<TConfig = unknown> {
	gameName: string;
	defaultConfig?: TConfig;
	lobby: Lobby<TConfig> | null;
	lobbyId: string | null;
	matchId: string | null;
	isHost: boolean;
	isReady: boolean;
	canStart: boolean;
	loading: boolean;
	acting: boolean;
	error: string | null;
	createLobby: (options?: {
		isPrivate?: boolean;
		config?: TConfig;
	}) => Promise<Lobby<TConfig> | null>;
	joinByCode: (code: string) => Promise<Lobby<TConfig> | null>;
	setReady: (ready: boolean) => Promise<Lobby<TConfig> | null>;
	startMatch: () => Promise<unknown>;
	leaveLobby: () => Promise<void>;
}

// biome-ignore lint/suspicious/noExplicitAny: generic context
const LobbyGateContext = createContext<LobbyGateContextValue<any> | null>(null);

export const useLobbyGate = <
	TConfig = unknown,
>(): LobbyGateContextValue<TConfig> => {
	const ctx = useContext(LobbyGateContext);
	if (!ctx) {
		throw new Error('useLobbyGate must be used inside <LobbyGate.Root>');
	}
	return ctx as LobbyGateContextValue<TConfig>;
};

export interface LobbyGateRootProps<TConfig = unknown> {
	/** Game definition or game name to create lobbies for */
	// biome-ignore lint/suspicious/noExplicitAny: generic game reference
	game: string | Game<any, MoveMap<any>, TConfig, any>;
	/** Optional default game config when creating a lobby */
	config?: TConfig;
	/** Optional initial or controlled lobby ID */
	lobbyId?: string | null;
	/** Optional container class name */
	className?: string;
	children: ReactNode | ((ctx: LobbyGateContextValue<TConfig>) => ReactNode);
}

const LobbyGateRoot = <TConfig = unknown>({
	game,
	config,
	lobbyId: controlledLobbyId = null,
	className,
	children,
}: LobbyGateRootProps<TConfig>) => {
	const gameName = typeof game === 'string' ? game : game.name;
	const {
		lobby,
		lobbyId,
		matchId,
		isHost,
		isReady,
		canStart,
		loading,
		acting,
		error,
		create,
		joinByCode: rawJoinByCode,
		setReady: rawSetReady,
		start,
		leave,
		reset,
	} = useLobby<TConfig>(controlledLobbyId);

	const ctx = useMemo<LobbyGateContextValue<TConfig>>(
		() => ({
			gameName,
			defaultConfig: config,
			lobby,
			lobbyId,
			matchId,
			isHost,
			isReady,
			canStart,
			loading,
			acting,
			error,
			createLobby: async (opts) => {
				try {
					return await create({
						game: gameName,
						config: opts?.config ?? config,
						isPrivate: opts?.isPrivate,
					});
				} catch {
					return null;
				}
			},
			joinByCode: async (code: string) => {
				try {
					return await rawJoinByCode(code);
				} catch {
					return null;
				}
			},
			setReady: async (ready: boolean) => {
				try {
					return await rawSetReady(ready);
				} catch {
					return null;
				}
			},
			startMatch: async () => {
				try {
					return await start();
				} catch {
					return null;
				}
			},
			leaveLobby: async () => {
				if (lobby?.status === 'open') {
					try {
						await leave();
					} catch {
						reset();
					}
				} else {
					reset();
				}
			},
		}),
		[
			gameName,
			config,
			lobby,
			lobbyId,
			matchId,
			isHost,
			isReady,
			canStart,
			loading,
			acting,
			error,
			create,
			rawJoinByCode,
			rawSetReady,
			start,
			leave,
			reset,
		],
	);

	const statusAttr = !lobby
		? 'idle'
		: lobby.status === 'started' && lobby.matchId
			? 'started'
			: 'waiting';

	const content = typeof children === 'function' ? children(ctx) : children;

	return (
		<LobbyGateContext.Provider value={ctx}>
			{className ? (
				<div
					data-bame-lobby-gate=""
					data-status={statusAttr}
					className={className}
				>
					{content}
				</div>
			) : (
				content
			)}
		</LobbyGateContext.Provider>
	);
};

export interface LobbyGateIdleProps {
	className?: string;
	children: ReactNode;
}

const LobbyGateIdle = ({ className, children }: LobbyGateIdleProps) => {
	const { lobby } = useLobbyGate();
	if (lobby) return null;
	return (
		<div data-bame-lobby-idle="" className={className}>
			{children}
		</div>
	);
};

export interface LobbyGateCreateButtonProps<TConfig = unknown> {
	isPrivate?: boolean;
	config?: TConfig;
	className?: string;
	children?: ReactNode;
}

const LobbyGateCreateButton = <TConfig = unknown>({
	isPrivate = true,
	config,
	className,
	children = 'Create Lobby',
}: LobbyGateCreateButtonProps<TConfig>) => {
	const { createLobby, acting } = useLobbyGate<TConfig>();
	return (
		<button
			type="button"
			data-bame-lobby-create=""
			disabled={acting}
			onClick={() => void createLobby({ isPrivate, config })}
			className={className}
		>
			{children}
		</button>
	);
};

export interface LobbyGateJoinByCodeFormProps {
	placeholder?: string;
	buttonLabel?: ReactNode;
	className?: string;
	inputClassName?: string;
	buttonClassName?: string;
}

const LobbyGateJoinByCodeForm = ({
	placeholder = 'Enter 6-letter code...',
	buttonLabel = 'Join',
	className,
	inputClassName,
	buttonClassName,
}: LobbyGateJoinByCodeFormProps) => {
	const { joinByCode, acting } = useLobbyGate();
	const [code, setCode] = useState('');

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!code.trim()) return;
		void joinByCode(code);
	};

	return (
		<form
			data-bame-lobby-join-form=""
			onSubmit={handleSubmit}
			className={className}
		>
			<input
				type="text"
				data-bame-lobby-code-input=""
				value={code}
				onChange={(e) => setCode(e.target.value.toUpperCase())}
				placeholder={placeholder}
				className={inputClassName}
			/>
			<button
				type="submit"
				data-bame-lobby-join-button=""
				disabled={acting || !code.trim()}
				className={buttonClassName}
			>
				{buttonLabel}
			</button>
		</form>
	);
};

export interface LobbyGateWaitingRoomProps {
	className?: string;
	children: ReactNode | ((lobby: Lobby) => ReactNode);
}

const LobbyGateWaitingRoom = ({
	className,
	children,
}: LobbyGateWaitingRoomProps) => {
	const { lobby, isHost, canStart } = useLobbyGate();
	if (!lobby || (lobby.status === 'started' && lobby.matchId)) {
		return null;
	}
	return (
		<div
			data-bame-lobby-waiting=""
			data-host={isHost}
			data-can-start={canStart}
			className={className}
		>
			{typeof children === 'function' ? children(lobby) : children}
		</div>
	);
};

export interface LobbyGateCodeBadgeProps {
	className?: string;
	fallback?: ReactNode;
}

const LobbyGateCodeBadge = ({
	className,
	fallback = 'Public',
}: LobbyGateCodeBadgeProps) => {
	const { lobby } = useLobbyGate();
	if (!lobby) return null;
	return (
		<p data-bame-lobby-code="" className={className}>
			{lobby.code ?? fallback}
		</p>
	);
};

export interface LobbyGateMemberSummaryProps {
	className?: string;
	label?: ReactNode;
	children?: (lobby: Lobby) => ReactNode;
}

const LobbyGateMemberSummary = ({
	className,
	label = 'Players',
	children,
}: LobbyGateMemberSummaryProps) => {
	const { lobby } = useLobbyGate();
	if (!lobby) return null;
	if (children) {
		return <>{children(lobby)}</>;
	}
	return (
		<p data-bame-lobby-members-summary="" className={className}>
			{label} ({lobby.members.length}/{lobby.maxPlayers}):{' '}
			<strong>{lobby.members.map((m) => m.userId).join(', ')}</strong>
		</p>
	);
};

export interface LobbyGateMemberListProps {
	className?: string;
	itemClassName?: string;
	renderMember?: (member: LobbyMember, lobby: Lobby) => ReactNode;
}

const LobbyGateMemberList = ({
	className,
	itemClassName,
	renderMember,
}: LobbyGateMemberListProps) => {
	const { lobby } = useLobbyGate();
	if (!lobby) return null;
	return (
		<ul data-bame-lobby-member-list="" className={className}>
			{lobby.members.map((member) => (
				<li
					key={member.userId}
					data-member={member.userId}
					data-ready={member.ready}
					data-host={member.userId === lobby.hostId}
					className={itemClassName}
				>
					{renderMember ? renderMember(member, lobby) : member.userId}
				</li>
			))}
		</ul>
	);
};

export interface LobbyGateReadyButtonProps {
	className?: string;
	readyLabel?: ReactNode;
	notReadyLabel?: ReactNode;
}

const LobbyGateReadyButton = ({
	className,
	readyLabel = 'Ready ✓',
	notReadyLabel = 'Mark Ready',
}: LobbyGateReadyButtonProps) => {
	const { isReady, setReady, acting } = useLobbyGate();
	return (
		<button
			type="button"
			data-bame-lobby-ready=""
			data-ready={isReady}
			disabled={acting}
			onClick={() => void setReady(!isReady)}
			className={className}
		>
			{isReady ? readyLabel : notReadyLabel}
		</button>
	);
};

export interface LobbyGateStartButtonProps {
	/** Only render the button when the user is host and `canStart` is true (default: `true`) */
	hideUntilCanStart?: boolean;
	className?: string;
	children?: ReactNode;
}

const LobbyGateStartButton = ({
	hideUntilCanStart = true,
	className,
	children = 'Start Match',
}: LobbyGateStartButtonProps) => {
	const { isHost, canStart, startMatch, acting } = useLobbyGate();
	if (!isHost) return null;
	if (hideUntilCanStart && !canStart) return null;

	return (
		<button
			type="button"
			data-bame-lobby-start=""
			data-can-start={canStart}
			disabled={!canStart || acting}
			onClick={() => void startMatch()}
			className={className}
		>
			{children}
		</button>
	);
};

export interface LobbyGateLeaveButtonProps {
	className?: string;
	children?: ReactNode;
}

const LobbyGateLeaveButton = ({
	className,
	children = 'Leave Lobby',
}: LobbyGateLeaveButtonProps) => {
	const { leaveLobby, acting } = useLobbyGate();
	return (
		<button
			type="button"
			data-bame-lobby-leave=""
			disabled={acting}
			onClick={() => void leaveLobby()}
			className={className}
		>
			{children}
		</button>
	);
};

export interface LobbyGateErrorProps {
	className?: string;
}

const LobbyGateError = ({ className }: LobbyGateErrorProps) => {
	const { error } = useLobbyGate();
	if (!error) return null;
	return (
		<p data-bame-lobby-error="" role="alert" className={className}>
			{error}
		</p>
	);
};

export interface LobbyGateMatchRenderArgs {
	matchId: string;
	lobby: Lobby;
	leave: () => void;
}

export interface LobbyGateMatchProps {
	children: ReactNode | ((args: LobbyGateMatchRenderArgs) => ReactNode);
}

const LobbyGateMatch = ({ children }: LobbyGateMatchProps) => {
	const { lobby, matchId, leaveLobby } = useLobbyGate();
	if (!lobby || lobby.status !== 'started' || !matchId) {
		return null;
	}
	if (typeof children === 'function') {
		return (
			<>
				{children({
					matchId,
					lobby,
					leave: () => {
						void leaveLobby();
					},
				})}
			</>
		);
	}
	return <>{children}</>;
};

export const LobbyGate = {
	Root: LobbyGateRoot,
	Idle: LobbyGateIdle,
	CreateButton: LobbyGateCreateButton,
	JoinByCodeForm: LobbyGateJoinByCodeForm,
	WaitingRoom: LobbyGateWaitingRoom,
	CodeBadge: LobbyGateCodeBadge,
	MemberSummary: LobbyGateMemberSummary,
	MemberList: LobbyGateMemberList,
	ReadyButton: LobbyGateReadyButton,
	StartButton: LobbyGateStartButton,
	LeaveButton: LobbyGateLeaveButton,
	Error: LobbyGateError,
	Match: LobbyGateMatch,
};
