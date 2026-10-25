import { runConsoleGame } from '@bame/ui-console';
import { nim } from './game';

runConsoleGame({
	game: nim,
	render: (view, { print, style: c, box }) => {
		const sticksBar =
			view.state.sticks > 0
				? c.yellow('┃ '.repeat(view.state.sticks).trim())
				: c.dim('(none)');
		print(
			box(
				[
					`Sticks remaining: ${c.bold(c.cyan(String(view.state.sticks)))}`,
					`  ${sticksBar}`,
				],
				{ title: c.cyan(`Turn #${view.turn.number}`) },
			),
		);
	},
	onTurn: async ({ playerId, ask, move, style: c }) => {
		const raw = await ask(
			`${c.cyan('›')} ${c.bold(playerId)}, how many sticks do you take (1, 2, or 3)? `,
		);
		await move('take', Number(raw));
	},
});
