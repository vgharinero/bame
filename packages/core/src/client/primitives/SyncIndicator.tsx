export type SyncStatus = 'connected' | 'syncing' | 'disconnected' | 'error';

export interface SyncIndicatorProps {
	status: SyncStatus;
	message?: string;
	className?: string;
	showText?: boolean;
}

export const SyncIndicator = ({
	status,
	message,
	className = '',
	showText = true,
}: SyncIndicatorProps) => {
	const statusConfig = {
		connected: {
			color: 'bg-green-500',
			text: message || 'Connected',
			pulse: false,
		},
		syncing: {
			color: 'bg-yellow-500',
			text: message || 'Syncing...',
			pulse: true,
		},
		disconnected: {
			color: 'bg-gray-400',
			text: message || 'Disconnected',
			pulse: false,
		},
		error: {
			color: 'bg-red-500',
			text: message || 'Connection error',
			pulse: true,
		},
	};

	const config = statusConfig[status];

	return (
		<div className={`flex items-center gap-2 ${className}`}>
			<output
				className={`h-2 w-2 rounded-full ${config.color} ${
					config.pulse ? 'animate-pulse' : ''
				}`}
				aria-label={config.text}
			/>
			{showText && <span className="text-sm text-gray-600">{config.text}</span>}
		</div>
	);
};
