import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: (error: Error, reset: () => void) => ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('Game error caught by ErrorBoundary:', error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	componentDidUpdate(prevProps: ErrorBoundaryProps) {
		// Reset error when resetKeys change (e.g., gameId changes)
		if (
			this.state.hasError &&
			this.props.resetKeys &&
			prevProps.resetKeys &&
			this.props.resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i])
		) {
			this.reset();
		}
	}

	reset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError && this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.error, this.reset);
			}

			// Default fallback UI
			return (
				<div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
					<div className="max-w-md rounded-lg bg-white p-6 shadow-lg">
						<h2 className="mb-4 text-xl font-bold text-red-600">Game Error</h2>
						<p className="mb-4 text-gray-700">
							Something went wrong. Please try again.
						</p>
						<details className="mb-4">
							<summary className="cursor-pointer text-sm text-gray-500">
								Error details
							</summary>
							<pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
								{this.state.error.message}
							</pre>
						</details>
						<button
							type="button"
							onClick={this.reset}
							className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
						>
							Try Again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
