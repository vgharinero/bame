import { runConsoleGame } from '@bame/ui-console';
import { guessNumber } from './game';

runConsoleGame({
	game: guessNumber,
	render: (view, { print, style: c, box }) => {
		const remaining = view.state.maxGuesses - view.state.guesses.length;
		const lines = [
			`Range: ${c.bold('1–20')}  ${c.dim('|')}  Attempts left: ${c.bold(remaining > 1 ? c.cyan(String(remaining)) : c.yellow(String(remaining)))}${c.dim(`/${view.state.maxGuesses}`)}`,
		];
		for (const g of view.state.guesses) {
			const hintText =
				g.hint === 'correct'
					? c.green('✅ CORRECT!')
					: g.hint === 'higher'
						? c.yellow('⬆️  Secret is HIGHER')
						: c.cyan('⬇️  Secret is LOWER');
			lines.push(`  • Guessed ${c.bold(String(g.value))}: ${hintText}`);
		}
		if (view.state.revealedSecret !== undefined) {
			lines.push(
				`  Secret number was: ${c.bold(c.magenta(String(view.state.revealedSecret)))}`,
			);
		}
		print(box(lines, { title: c.cyan('Guess the Number') }));
	},
	onTurn: async ({ ask, move, style: c }) => {
		const raw = await ask(`${c.cyan('›')} Enter your guess (1-20): `);
		await move('guess', Number(raw));
	},
});
