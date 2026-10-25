import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	title: 'Tic-Tac-Toe — Powered by @bame/core & @bame/react',
	description: 'Playable multiplayer Tic-Tac-Toe built with Bame',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
				{children}
			</body>
		</html>
	);
}
