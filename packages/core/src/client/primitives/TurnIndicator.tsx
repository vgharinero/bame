import type { Player } from '../../engine/types/player';

export interface TurnIndicatorProps {
	currentPlayer: Player<any>;
	isMyTurn: boolean;
	phase?: string;
	className?: string;
	myTurnClassName?: string;
	opponentTurnClassName?: string;
}

export function TurnIndicator({
	currentPlayer,
	isMyTurn,
	phase,
	className = '',
	myTurnClassName = 'bg-green-100 text-green-800 border-green-300',
	opponentTurnClassName = 'bg-gray-100 text-gray-600 border-gray-300',
}: TurnIndicatorProps) {
	const displayName = currentPlayer.displayName;
	const turnText = isMyTurn ? 'Your turn' : `${displayName}'s turn`;
	const phaseText = phase && phase !== 'main' ? ` - ${phase}` : '';

	return (
		<output
			className={`rounded-lg border-2 px-4 py-2 text-center font-medium ${
				isMyTurn ? myTurnClassName : opponentTurnClassName
			} ${className}`}
			aria-live="polite"
		>
			{turnText}
			{phaseText && <span className="text-sm opacity-75">{phaseText}</span>}
		</output>
	);
}
