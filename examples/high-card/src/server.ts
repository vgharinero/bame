import { createBame } from '@bame/core';
import { listenBameServer, localFileStorage } from '@bame/storage-local';
import { highCard } from './game';

const PORT = Number(process.env.PORT ?? 4100);
const DATA_FILE = process.env.BAME_DATA_FILE ?? './.bame-high-card.json';

async function start() {
	const bame = createBame({
		games: [highCard],
		storage: localFileStorage({ file: DATA_FILE }),
	});

	const server = await listenBameServer(bame, {
		unsafeTrustClientIds: true,
		port: PORT,
	});
	console.log(`=================================================`);
	console.log(`🃏 High-Card Authoritative Game Server listening`);
	console.log(`   URL:     ${server.url}`);
	console.log(`   Storage: ${DATA_FILE}`);
	console.log(`   Open 2+ terminals and run: pnpm --filter high-card play`);
	console.log(`=================================================`);
}

start().catch((err) => {
	console.error(err);
	process.exit(1);
});
