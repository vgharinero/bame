'use client';

import { useAuth } from '@bame/core/infra/nextjs/providers';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomePage() {
	const { user, isLoading, signIn, signUp } = useAuth();
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [isSignUp, setIsSignUp] = useState(false);
	const [error, setError] = useState('');

	// Redirect if already logged in
	useEffect(() => {
		if (user && !isLoading) {
			router.push('/lobbies');
		}
	}, [user, isLoading, router]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');

		try {
			if (isSignUp) {
				await signUp(email, password, displayName);
			} else {
				await signIn(email, password);
			}
			router.push('/lobbies');
		} catch (err: any) {
			setError(err.message);
		}
	};

	if (user && !isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				Redirecting...
			</div>
		);
	}

	if (isLoading)
		return (
			<div className="flex min-h-screen items-center justify-center">
				Loading...
			</div>
		);

	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-100">
			<div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
				<h1 className="mb-6 text-3xl font-bold text-center">Tic-Tac-Toe</h1>

				<form onSubmit={handleSubmit} className="space-y-4">
					{isSignUp && (
						<input
							type="text"
							placeholder="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							className="w-full rounded border p-2"
							required
						/>
					)}

					<input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full rounded border p-2"
						required
					/>

					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded border p-2"
						required
					/>

					{error && <p className="text-red-600 text-sm">{error}</p>}

					<button
						type="submit"
						className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700"
					>
						{isSignUp ? 'Sign Up' : 'Sign In'}
					</button>
				</form>

				<button
					type="button"
					onClick={() => setIsSignUp(!isSignUp)}
					className="mt-4 w-full text-sm text-blue-600 hover:underline"
				>
					{isSignUp
						? 'Already have an account? Sign in'
						: "Don't have an account? Sign up"}
				</button>
			</div>
		</div>
	);
}
