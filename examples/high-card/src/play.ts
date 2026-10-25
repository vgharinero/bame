import { createBameClient } from '@bame/core';
import { runConsoleGame } from '@bame/ui-console';
import { highCard } from './game';

const isLocalPassAndPlay = process.argv.includes('--local');
const serverUrl =
	process.env.BAME_SERVER_URL ?? 'http://localhost:4100/api/bame';

const formatCard = (val: number | undefined): string => {
	if (val === undefined) return '[ ? ]';
	const labels: Record<number, string> = {
		1: 'A',
		11: 'J',
		12: 'Q',
		13: 'K',
	};
	return `[ ${labels[val] ?? String(val)} ]`;
};

runConsoleGame({
	game: highCard,
	mode: isLocalPassAndPlay ? 'local' : 'online',
	passAndPlay: isLocalPassAndPlay,
	bame: isLocalPassAndPlay ? undefined : createBameClient({ url: serverUrl }),
	render: (view, { print, style: c, box }) => {
		const rows = view.players.map((p) => {
			const rawCard = formatCard(view.state.cards[p.id]);
			const isRevealed = view.state.revealed.includes(p.id);
			const didRedraw = view.state.redrawn.includes(p.id);
			const cardStr = isRevealed
				? c.bold(c.green(rawCard))
				: view.state.cards[p.id] !== undefined
					? c.bold(c.cyan(rawCard))
					: c.dim(rawCard);
			const statusTags = [
				p.id === view.playerId ? c.cyan('(You)') : '',
				isRevealed ? c.green('REVEALED') : c.dim('hidden'),
				didRedraw ? c.yellow('redrew') : '',
			]
				.filter(Boolean)
				.join(c.dim(' · '));
			return `${c.bold(p.id.padEnd(12, ' '))} ${cardStr}  ${statusTags}`;
		});
		print(
			box(rows, {
				title: c.cyan(`Table View — ${view.playerId ?? 'Spectator'}`),
			}),
		);
	},
	onTurn: async ({ view, playerId, ask, move, style: c }) => {
		const canRedraw =
			!view.state.redrawn.includes(playerId) &&
			!view.state.revealed.includes(playerId);

		const promptText = canRedraw
			? `${c.cyan('›')} ${c.bold(playerId)}, choose action — ${c.green('(r)')}eveal or ${c.yellow('(d)')}raw a new card [r/d]: `
			: `${c.cyan('›')} ${c.bold(playerId)}, press [Enter] or type ${c.green('(r)')} to reveal your card: `;

		const choice = (await ask(promptText)).toLowerCase();
		if (choice === 'd' || choice === 'redraw') {
			await move('redraw');
		} else {
			await move('reveal');
		}
	},
});
