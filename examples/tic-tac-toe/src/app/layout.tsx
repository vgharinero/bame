import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@bame/core/infra/nextjs/providers';

export const metadata: Metadata = {
	title: 'Tic-Tac-Toe',
	description: 'Multiplayer Tic-Tac-Toe powered by turn-based game engine',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<Providers
					url={process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL!}
					publishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}
				>
					{children}
				</Providers>
			</body>
		</html>
	);
}
