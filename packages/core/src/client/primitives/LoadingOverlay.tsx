export interface LoadingOverlayProps {
	isLoading: boolean;
	message?: string | null;
	className?: string;
	overlayClassName?: string;
	spinnerClassName?: string;
}

export const LoadingOverlay = ({
	isLoading,
	message = 'Loading...',
	className = '',
	overlayClassName = '',
	spinnerClassName = '',
}: LoadingOverlayProps) => {
	if (!isLoading) return null;

	return (
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 ${overlayClassName}`}
			role="dialog"
			aria-busy="true"
			aria-label={message || 'Loading'}
		>
			<div
				className={`flex flex-col items-center gap-4 rounded-lg bg-white p-8 ${className}`}
			>
				<div
					className={`h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 ${spinnerClassName}`}
					aria-hidden="true"
				/>
				{message && (
					<p className="text-lg font-medium text-gray-700">{message}</p>
				)}
			</div>
		</div>
	);
};
