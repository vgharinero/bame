import { type BameInstance, createBame, createBameHandler } from '@bame/core';
import { rockPaperScissors } from '../../../game';

const globalForBame = globalThis as unknown as {
	__rpsBameServer?: BameInstance;
};

const bameServer =
	globalForBame.__rpsBameServer ??
	createBame({
		games: [rockPaperScissors],
	});

globalForBame.__rpsBameServer = bameServer;

export const dynamic = 'force-dynamic';

export const { GET, POST } = createBameHandler(bameServer, {
	unsafeTrustClientIds: true,
});
