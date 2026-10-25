import type {
	Game,
	GameResult,
	MatchStatus,
	MoveMap,
	Profile,
	ProfileGameStats,
} from '@bame/core';
import { type ReactNode, useEffect, useState } from 'react';
import { useBame, useProfile } from './hooks.js';

export type ProfileStatField = keyof ProfileGameStats;

export interface PlayerStatsProps {
	/** Player ID to display stats for (defaults to active `userId` in `BameProvider`) */
	userId?: string;
	/**
	 * Optional game name or `Game` definition to display per-game stats
	 * (`profile.statsByGame[gameName]`) instead of overall profile stats.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: generic game reference
	game?: string | Game<any, MoveMap<any>, any, any>;
	/** Which stat fields to display (default: `['wins', 'losses', 'draws']`) */
	fields?: readonly ProfileStatField[];
	/** Custom label prefix per stat field */
	labels?: Partial<Record<ProfileStatField, ReactNode>>;
	/** Optional prefix before the player's display name (e.g. `"Player: "` or `"Connected as "`) */
	namePrefix?: ReactNode;
	/** Optional separator node rendered between items */
	separator?: ReactNode;
	/** Container class name */
	className?: string;
	/** Class name applied to the player's display name element */
	nameClassName?: string;
	/** Base class name applied to every stat item */
	statClassName?: string;
	/** Per-field class name overrides (e.g. `{ wins: 'text-emerald-400', losses: 'text-rose-400' }`) */
	statClassNames?: Partial<Record<ProfileStatField, string>>;
	/** Optional render-prop escape hatch for completely custom markup */
	children?: (profile: Profile, stats: ProfileGameStats) => ReactNode;
}

const DEFAULT_STAT_FIELDS: readonly ProfileStatField[] = [
	'wins',
	'losses',
	'draws',
];

const DEFAULT_STAT_LABELS: Record<ProfileStatField, string> = {
	wins: 'W:',
	losses: 'L:',
	draws: 'D:',
	totalGames: 'Total:',
	totalScore: 'Score:',
};

const EMPTY_GAME_STATS: ProfileGameStats = {
	wins: 0,
	losses: 0,
	draws: 0,
	totalGames: 0,
	totalScore: 0,
};

export const PlayerStats = ({
	userId,
	game,
	fields = DEFAULT_STAT_FIELDS,
	labels,
	namePrefix,
	separator,
	className,
	nameClassName,
	statClassName,
	statClassNames,
	children,
}: PlayerStatsProps) => {
	const { profile } = useProfile(userId);
	if (!profile) return null;

	const gameName =
		typeof game === 'string' ? game : game ? game.name : undefined;
	const resolvedStats: ProfileGameStats = gameName
		? (profile.statsByGame?.[gameName] ?? EMPTY_GAME_STATS)
		: { ...profile.stats, totalScore: 0 };

	if (children) {
		return <>{children(profile, resolvedStats)}</>;
	}

	return (
		<div
			data-bame-player-stats=""
			data-user-id={profile.id}
			data-game={gameName}
			className={className}
		>
			<span>
				{namePrefix}
				<span data-bame-player-name="" className={nameClassName}>
					{profile.displayName}
				</span>
			</span>
			{fields.map((field) => {
				const label = labels?.[field] ?? DEFAULT_STAT_LABELS[field];
				const itemClass = [statClassName, statClassNames?.[field]]
					.filter(Boolean)
					.join(' ');
				return (
					<span key={field} className="inline-flex items-center gap-1">
						{separator && <span aria-hidden="true">{separator}</span>}
						<span
							data-stat={field}
							className={itemClass ? itemClass : undefined}
						>
							{label} {resolvedStats[field]}
						</span>
					</span>
				);
			})}
		</div>
	);
};

export interface SeatSwitcherRenderArgs {
	player: string;
	isActive: boolean;
	select: () => void;
}

export interface SeatSwitcherProps {
	/** List of player seat IDs that can be selected */
	players: readonly string[];
	/** Optional label rendered before the seat buttons */
	label?: ReactNode;
	/** Container class name */
	className?: string;
	/** Class name for the optional label */
	labelClassName?: string;
	/**
	 * Class name applied to each seat button.
	 * Use `data-[active=true]:...` in Tailwind or `button[data-active="true"]` in CSS to style the active seat.
	 */
	buttonClassName?: string;
	/** Optional render-prop to customize individual seat buttons */
	renderSeat?: (args: SeatSwitcherRenderArgs) => ReactNode;
}

export const SeatSwitcher = ({
	players,
	label,
	className,
	labelClassName,
	buttonClassName,
	renderSeat,
}: SeatSwitcherProps) => {
	const { userId, setUserId } = useBame();

	return (
		<div data-bame-seat-switcher="" className={className}>
			{label && (
				<span data-bame-seat-label="" className={labelClassName}>
					{label}
				</span>
			)}
			{players.map((player) => {
				const isActive = userId === player;
				const select = () => setUserId(player);
				if (renderSeat) {
					return (
						<span key={player} className="contents">
							{renderSeat({ player, isActive, select })}
						</span>
					);
				}
				return (
					<button
						key={player}
						type="button"
						data-seat={player}
						data-active={isActive}
						aria-pressed={isActive}
						onClick={select}
						className={buttonClassName}
					>
						{player}
					</button>
				);
			})}
		</div>
	);
};

export interface MatchResultRenderArgs {
	outcome: 'win' | 'draw';
	winner: string | null;
	result?: GameResult;
	onAction?: () => void;
}

export interface MatchResultProps {
	/** Current match status — component renders nothing unless `status === 'finished'` */
	status: MatchStatus | null;
	/** Match result object from `useMatch` */
	result?: GameResult;
	/** Custom formatter when a winner exists (default: ``(w) => `Winner: ${w}!` ``) */
	formatWinner?: (winner: string) => ReactNode;
	/** Custom message when the match ends without a winner (default: `'Draw Game!'`) */
	drawText?: ReactNode;
	/** Label for the primary action button (e.g. `'Play Again'` or `'Back to Lobby'`) */
	actionLabel?: ReactNode;
	/** Callback fired when the action button is clicked */
	onAction?: () => void;
	/** Container class name */
	className?: string;
	/** Title message class name */
	titleClassName?: string;
	/** Action button class name */
	buttonClassName?: string;
	/** Optional render-prop escape hatch */
	children?: (args: MatchResultRenderArgs) => ReactNode;
}

export const MatchResult = ({
	status,
	result,
	formatWinner = (winner) => `Winner: ${winner}!`,
	drawText = 'Draw Game!',
	actionLabel = 'Play Again',
	onAction,
	className,
	titleClassName,
	buttonClassName,
	children,
}: MatchResultProps) => {
	if (status !== 'finished') return null;

	const winner =
		result && 'winner' in result && result.winner ? result.winner : null;
	const outcome: 'win' | 'draw' = winner ? 'win' : 'draw';

	if (children) {
		return <>{children({ outcome, winner, result, onAction })}</>;
	}

	return (
		<div
			data-bame-match-result=""
			data-outcome={outcome}
			data-winner={winner ?? undefined}
			className={className}
		>
			<p data-bame-match-result-title="" className={titleClassName}>
				{winner ? formatWinner(winner) : drawText}
			</p>
			{onAction && (
				<button
					type="button"
					data-bame-match-result-action=""
					onClick={onAction}
					className={buttonClassName}
				>
					{actionLabel}
				</button>
			)}
		</div>
	);
};

export interface PassAndPlayPromptArgs {
	playerId: string;
	reveal: () => void;
}

export interface PassAndPlayGuardProps {
	/** Active turn's player ID (`turn?.currentPlayerId`) */
	currentPlayerId?: string | null;
	/** Whether the privacy guard is active (default: `true`) */
	enabled?: boolean;
	/** Container class name for the interstitial screen */
	className?: string;
	/** Message class name */
	titleClassName?: string;
	/** Reveal button class name */
	buttonClassName?: string;
	/** Custom prompt formatter */
	formatPrompt?: (playerId: string) => ReactNode;
	/** Custom button label or formatter */
	buttonLabel?: ReactNode | ((playerId: string) => ReactNode);
	/** Optional render-prop for full interstitial customization */
	renderPrompt?: (args: PassAndPlayPromptArgs) => ReactNode;
	/** Game board rendered once the active player confirms */
	children: ReactNode;
}

export const PassAndPlayGuard = ({
	currentPlayerId,
	enabled = true,
	className,
	titleClassName,
	buttonClassName,
	formatPrompt = (playerId) => `Pass the device to ${playerId}`,
	buttonLabel = (playerId) => `I am ${playerId} — Reveal Board`,
	renderPrompt,
	children,
}: PassAndPlayGuardProps) => {
	const [revealedPlayerId, setRevealedPlayerId] = useState<string | null>(
		currentPlayerId ?? null,
	);

	useEffect(() => {
		if (currentPlayerId && revealedPlayerId === null) {
			setRevealedPlayerId(currentPlayerId);
		}
	}, [currentPlayerId, revealedPlayerId]);

	const isHidden =
		enabled &&
		Boolean(currentPlayerId) &&
		revealedPlayerId !== null &&
		revealedPlayerId !== currentPlayerId;

	if (!isHidden || !currentPlayerId) {
		return <>{children}</>;
	}

	const reveal = () => setRevealedPlayerId(currentPlayerId);

	if (renderPrompt) {
		return <>{renderPrompt({ playerId: currentPlayerId, reveal })}</>;
	}

	return (
		<div
			data-bame-pass-guard=""
			data-player={currentPlayerId}
			className={className}
		>
			<p data-bame-pass-guard-title="" className={titleClassName}>
				{formatPrompt(currentPlayerId)}
			</p>
			<button
				type="button"
				data-bame-pass-guard-button=""
				onClick={reveal}
				className={buttonClassName}
			>
				{typeof buttonLabel === 'function'
					? buttonLabel(currentPlayerId)
					: buttonLabel}
			</button>
		</div>
	);
};
