import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	title: 'Rock-Paper-Scissors (Online Server) — @bame/core & @bame/ui-react',
	description:
		'Multi-tab online Rock-Paper-Scissors powered by createBameHandler & createBameClient',
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
