import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	title: 'Lights Out (Singleplayer) — Powered by @bame/core & @bame/ui-react',
	description: 'Singleplayer puzzle built with Bame',
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
