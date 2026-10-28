import readline from 'node:readline/promises';
import {
	type BameRuntime,
	createBame,
	type Game,
	type Lobby,
	type MatchView,
	type MoveArgs,
	type MoveMap,
	type Profile,
} from '@bame/core';

const isColorEnabled = (): boolean =>
	typeof process !== 'undefined' &&
	process.env?.NO_COLOR === undefined &&
	process.env?.TERM !== 'dumb';

const wrapAnsi =
	(open: string, close: string) =>
	(text: string): string =>
		isColorEnabled() ? `\x1b[${open}m${text}\x1b[${close}m` : text;

export interface ConsoleStyleHelpers {
	bold: (text: string) => string;
	dim: (text: string) => string;
	cyan: (text: string) => string;
	green: (text: string) => string;
	yellow: (text: string) => string;
	red: (text: string) => string;
	magenta: (text: string) => string;
	blue: (text: string) => string;
	gray: (text: string) => string;
}

export const consoleStyle: ConsoleStyleHelpers = {
	bold: wrapAnsi('1', '22'),
	dim: wrapAnsi('2', '22'),
	cyan: wrapAnsi('36', '39'),
	green: wrapAnsi('32', '39'),
	yellow: wrapAnsi('33', '39'),
	red: wrapAnsi('31', '39'),
	magenta: wrapAnsi('35', '39'),
	blue: wrapAnsi('34', '39'),
	gray: wrapAnsi('90', '39'),
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI escape codes for width calculation
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export const visibleLength = (text: string): number =>
	text.replace(ANSI_REGEX, '').length;

export interface ConsoleBoxOptions {
	title?: string;
	color?: (text: string) => string;
	paddingX?: number;
}

/**
 * Format one or more lines inside a rounded Unicode box (`╭───╮`).
 */
export const formatBox = (
	content: string | readonly string[],
	options: ConsoleBoxOptions = {},
): string => {
	const lines = typeof content === 'string' ? content.split('\n') : content;
	const padX = options.paddingX ?? 2;
	const colorBorder = options.color ?? consoleStyle.cyan;
	const titleText = options.title ? ` ${options.title} ` : '';
	const titleLen = visibleLength(titleText);

	const maxContentWidth = lines.reduce(
		(max, line) => Math.max(max, visibleLength(line)),
		0,
	);
	const innerWidth = Math.max(maxContentWidth + padX * 2, titleLen + 4, 38);
	const horizontalPad = ' '.repeat(padX);

	const topDashCount = Math.max(0, innerWidth - titleLen - 1);
	const topBorder = titleText
		? `${colorBorder('╭─')}${consoleStyle.bold(titleText)}${colorBorder(`${'─'.repeat(topDashCount)}╮`)}`
		: colorBorder(`╭${'─'.repeat(innerWidth)}╮`);

	const bodyLines = lines.map((line) => {
		const len = visibleLength(line);
		const trailing = ' '.repeat(Math.max(0, innerWidth - padX * 2 - len));
		return `${colorBorder('│')}${horizontalPad}${line}${trailing}${horizontalPad}${colorBorder('│')}`;
	});

	const bottomBorder = colorBorder(`╰${'─'.repeat(innerWidth)}╯`);
	return [topBorder, ...bodyLines, bottomBorder].join('\n');
};

export interface ConsolePromptHelpers {
	ask(question: string): Promise<string>;
	print(message?: string): void;
	clear(): void;
	style: ConsoleStyleHelpers;
	box(content: string | readonly string[], options?: ConsoleBoxOptions): string;
}

export interface ConsoleTurnContext<
	TView,
	// biome-ignore lint/suspicious/noExplicitAny: generic default
	TMoves extends MoveMap<any>,
> extends ConsolePromptHelpers {
	view: MatchView<TView>;
	playerId: string;
	move: <K extends keyof TMoves & string>(
		moveName: K,
		...args: MoveArgs<TMoves[K]>
	) => Promise<
		{ ok: true; view: MatchView<TView> } | { ok: false; error: string }
	>;
}

export interface RunConsoleGameOptions<
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = unknown,
	TView = TState,
> {
	game: Game<TState, TMoves, TConfig, TView>;
	bame?: BameRuntime;
	/**
	 * Play mode:
	 * - `'local'` (default): single-player or local pass-and-play in one terminal.
	 * - `'online'`: connects to a shared `bame` runtime/server; prompts to Create or Join
	 *   a lobby by code so each player plays from their own terminal window.
	 */
	mode?: 'local' | 'online';
	players?: string[];
	config?: TConfig;
	/**
	 * In `'local'` mode, clears the terminal before each player's turn and prompts them to
	 * press Enter before revealing their private MatchView.
	 */
	passAndPlay?: boolean;
	/**
	 * Render the public/player board state before prompting for a move.
	 */
	render: (view: MatchView<TView>, helpers: ConsolePromptHelpers) => void;
	/**
	 * Prompt the current player and execute a move using `ctx.move(...)`.
	 */
	onTurn: (ctx: ConsoleTurnContext<TView, TMoves>) => Promise<void>;
}

const formatMatchResultBanner = (view: MatchView<unknown>): string => {
	const c = consoleStyle;
	if (view.result && 'winner' in view.result && view.result.winner) {
		return formatBox(
			`${c.bold(c.green(`🏆 Winner: ${view.result.winner}!`))}`,
			{
				title: c.green('Match Complete'),
				color: c.green,
			},
		);
	}
	return formatBox(`${c.bold(c.yellow('🤝 Match ended in a draw!'))}`, {
		title: c.yellow('Match Complete'),
		color: c.yellow,
	});
};

const formatLeaderboard = (profiles: Profile[]): string => {
	const c = consoleStyle;
	const border = c.gray;
	const lines = [
		'',
		border('┌─────────────────┬──────┬──────┬──────┬───────┐'),
		`${border('│')} ${c.bold('Player'.padEnd(15, ' '))} ${border('│')} ${c.bold(c.green('Wins'))} ${border('│')} ${c.bold(c.red('Loss'))} ${border('│')} ${c.bold(c.yellow('Draw'))} ${border('│')} ${c.bold('Total')} ${border('│')}`,
		border('├─────────────────┼──────┼──────┼──────┼───────┤'),
	];
	for (const p of profiles) {
		const name = p.displayName.padEnd(15, ' ').slice(0, 15);
		const w = c.green(String(p.stats.wins).padStart(4, ' '));
		const l = c.red(String(p.stats.losses).padStart(4, ' '));
		const d = c.yellow(String(p.stats.draws).padStart(4, ' '));
		const t = String(p.stats.totalGames).padStart(5, ' ');
		lines.push(
			`${border('│')} ${name} ${border('│')} ${w} ${border('│')} ${l} ${border('│')} ${d} ${border('│')} ${t} ${border('│')}`,
		);
	}
	lines.push(border('└─────────────────┴──────┴──────┴──────┴───────┘'));
	return lines.join('\n');
};

const runOnlineConsoleSession = async <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = unknown,
	TView = TState,
>(
	options: RunConsoleGameOptions<TState, TMoves, TConfig, TView>,
	bame: BameRuntime,
	helpers: ConsolePromptHelpers,
): Promise<void> => {
	const c = helpers.style;
	const enteredName = await helpers.ask(
		`${c.cyan('?')} Enter your player name: `,
	);
	const myUserId =
		enteredName || `Player-${Math.floor(100 + Math.random() * 900)}`;
	await bame.profiles.ensure(myUserId, { displayName: myUserId });

	let playAgain = true;
	while (playAgain) {
		helpers.print('');
		helpers.print(
			helpers.box(
				[
					`${c.cyan('1)')} Create a new Lobby ${c.dim('(Host)')}`,
					`${c.cyan('2)')} Join a Lobby by 6-letter Code`,
					`${c.cyan('3)')} Join an Open Public Lobby`,
				],
				{ title: c.cyan(`Online Lobby — ${myUserId}`), color: c.cyan },
			),
		);
		const choice =
			(await helpers.ask(
				`${c.cyan('?')} Select ${c.dim('[1/2/3]')} (default 1): `,
			)) || '1';

		let lobby: Lobby<TConfig>;
		if (choice === '2') {
			const code = await helpers.ask(
				`${c.cyan('?')} Enter 6-letter Join Code: `,
			);
			lobby = (await bame.lobbies.joinByCode({
				userId: myUserId,
				code,
			})) as Lobby<TConfig>;
		} else if (choice === '3') {
			const openLobbies = await bame.lobbies.list(options.game.name);
			if (openLobbies.length === 0) {
				helpers.print(
					c.yellow('No open public lobbies found. Creating one instead...'),
				);
				lobby = await bame.lobbies.create({
					userId: myUserId,
					game: options.game.name,
					config: options.config,
				});
			} else {
				lobby = (await bame.lobbies.join({
					userId: myUserId,
					lobbyId: openLobbies[0].id,
				})) as Lobby<TConfig>;
			}
		} else {
			const isPrivateAnswer = await helpers.ask(
				`${c.cyan('?')} Make lobby private with a join code? ${c.dim('(y/n) [y]')}: `,
			);
			const isPrivate =
				isPrivateAnswer === '' || isPrivateAnswer.toLowerCase().startsWith('y');
			lobby = await bame.lobbies.create({
				userId: myUserId,
				game: options.game.name,
				config: options.config,
				isPrivate,
			});
		}

		helpers.print('');
		if (lobby.code) {
			helpers.print(
				helpers.box(
					[
						`Share this Join Code with other terminal(s):`,
						`  ${c.bold(c.magenta(lobby.code))}`,
					],
					{ title: c.magenta('🔑 Private Room'), color: c.magenta },
				),
			);
		} else {
			helpers.print(
				helpers.box(`Public Lobby ID: ${c.bold(lobby.id)}`, {
					title: c.cyan('🌐 Public Room'),
					color: c.cyan,
				}),
			);
		}

		// Wait until lobby starts
		let matchId = lobby.matchId;
		if (lobby.status !== 'started' || !matchId) {
			await new Promise<void>((resolve) => {
				let settled = false;
				let lastMemberCount = 0;

				const handleLobbyUpdate = async (updated: Lobby) => {
					if (settled) return;
					lobby = updated as Lobby<TConfig>;

					if (updated.members.length !== lastMemberCount) {
						lastMemberCount = updated.members.length;
						const names = updated.members
							.map((m) => c.bold(m.userId))
							.join(', ');
						helpers.print(
							`${c.cyan('👥')} Players (${updated.members.length}/${updated.maxPlayers}): ${names}`,
						);
					}

					if (updated.status === 'started' && updated.matchId) {
						settled = true;
						matchId = updated.matchId;
						clearInterval(pollTimer);
						unsub();
						resolve();
						return;
					}

					if (
						updated.hostId === myUserId &&
						updated.members.length >= updated.minPlayers
					) {
						settled = true;
						clearInterval(pollTimer);
						unsub();
						const started = await bame.lobbies.start({
							userId: myUserId,
							lobbyId: updated.id,
						});
						matchId = started.id;
						resolve();
					}
				};

				const unsub = bame.lobbies.subscribe(
					lobby.id,
					(updated) => {
						void handleLobbyUpdate(updated);
					},
					{ userId: myUserId },
				);

				const pollTimer = setInterval(() => {
					void bame.lobbies.get<TConfig>(lobby.id, myUserId).then((latest) => {
						if (latest) void handleLobbyUpdate(latest);
					});
				}, 500);

				helpers.print(
					c.dim(
						`⏳ Waiting for at least ${lobby.minPlayers} players to join...`,
					),
				);

				void handleLobbyUpdate(lobby);
			});
		}

		if (!matchId) {
			throw new Error('Failed to start match');
		}

		// Play match loop
		let lastRenderedVersion = 0;
		let isPrompting = false;
		let pendingView: MatchView<TView> | null = null;

		await new Promise<void>((resolveMatch) => {
			const handleView = async (view: MatchView<TView>) => {
				if (view.version <= lastRenderedVersion) return;
				if (isPrompting) {
					if (!pendingView || view.version > pendingView.version) {
						pendingView = view;
					}
					return;
				}
				lastRenderedVersion = view.version;

				helpers.print('');
				options.render(view, helpers);

				if (view.status === 'finished') {
					helpers.print('');
					helpers.print(formatMatchResultBanner(view));
					unsubMatch();
					resolveMatch();
					return;
				}

				if (view.turn.currentPlayerId !== myUserId) {
					helpers.print(
						c.dim(
							`⏳ Waiting for ${c.bold(view.turn.currentPlayerId)} to make a move...`,
						),
					);
					return;
				}

				isPrompting = true;
				try {
					let moveSucceeded = false;
					while (!moveSucceeded) {
						await options.onTurn({
							...helpers,
							view,
							playerId: myUserId,
							move: async (moveName, ...args) => {
								const res = await bame.matches.move<TView, TMoves>({
									userId: myUserId,
									matchId: matchId as string,
									move: moveName,
									args,
								});
								if (res.ok) {
									moveSucceeded = true;
									if (!pendingView || res.view.version > pendingView.version) {
										pendingView = res.view;
									}
								} else {
									helpers.print(c.red(`  ✖ Invalid move: ${res.error}`));
								}
								return res;
							},
						});
					}
				} finally {
					isPrompting = false;
					if (pendingView && pendingView.version > lastRenderedVersion) {
						const next = pendingView;
						pendingView = null;
						void handleView(next);
					}
				}
			};

			const unsubMatch = bame.matches.subscribe<TView>(
				matchId as string,
				myUserId,
				(incomingView) => {
					void handleView(incomingView);
				},
			);

			void bame.matches.get<TView>(matchId as string, myUserId).then((v) => {
				if (v) void handleView(v);
			});
		});

		const leaderboard = await bame.profiles.list();
		helpers.print(formatLeaderboard(leaderboard));

		const answer = await helpers.ask(
			`\n${c.cyan('?')} Play another round? ${c.dim('(y/n) [y]')}: `,
		);
		playAgain = answer === '' || answer.toLowerCase().startsWith('y');
	}
};

/**
 * Interactive terminal runner for any Bame `defineGame` definition.
 * Supports single-player, local pass-and-play multiplayer, and online multi-terminal
 * multiplayer connected via `createBameClient`.
 */
export const runConsoleGame = async <
	TState,
	TMoves extends MoveMap<TState>,
	TConfig = unknown,
	TView = TState,
>(
	options: RunConsoleGameOptions<TState, TMoves, TConfig, TView>,
): Promise<void> => {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const c = consoleStyle;
	const helpers: ConsolePromptHelpers = {
		ask: async (q: string) => (await rl.question(q)).trim(),
		print: (msg = '') => console.log(msg),
		clear: () => console.clear(),
		style: c,
		box: formatBox,
	};

	const bame = options.bame ?? createBame({ games: [options.game] });

	try {
		const modeBadge =
			options.mode === 'online'
				? c.magenta('ONLINE MULTIPLAYER')
				: options.game.maxPlayers === 1
					? c.cyan('SINGLEPLAYER')
					: c.cyan('LOCAL MULTIPLAYER');

		helpers.print('');
		helpers.print(
			formatBox(
				[
					`${c.bold(options.game.name.toUpperCase())}  ${c.dim('•')}  ${modeBadge}`,
				],
				{ title: c.cyan('BAME'), color: c.cyan },
			),
		);

		if (options.mode === 'online') {
			await runOnlineConsoleSession(options, bame, helpers);
			return;
		}

		const playerIds = options.players ? [...options.players] : [];
		if (playerIds.length === 0) {
			let count = options.game.minPlayers;
			if (options.game.minPlayers !== options.game.maxPlayers) {
				while (true) {
					const raw = await helpers.ask(
						`${c.cyan('?')} How many players (${options.game.minPlayers}-${options.game.maxPlayers})? ${c.dim(`[${options.game.minPlayers}]`)}: `,
					);
					const parsed = raw === '' ? options.game.minPlayers : Number(raw);
					if (
						Number.isInteger(parsed) &&
						parsed >= options.game.minPlayers &&
						parsed <= options.game.maxPlayers
					) {
						count = parsed;
						break;
					}
					helpers.print(
						c.red(
							`  Please enter a number between ${options.game.minPlayers} and ${options.game.maxPlayers}.`,
						),
					);
				}
			}

			for (let i = 0; i < count; i++) {
				const defaultName = count === 1 ? 'Player' : `Player ${i + 1}`;
				const entered = await helpers.ask(
					`${c.cyan('?')} Enter name for ${defaultName} ${c.dim(`[${defaultName}]`)}: `,
				);
				const name = entered || defaultName;
				playerIds.push(name);
			}
		}

		for (const id of playerIds) {
			await bame.profiles.ensure(id, { displayName: id });
		}

		let playAgain = true;
		while (playAgain) {
			const hostId = playerIds[0];
			const lobby = await bame.lobbies.create({
				userId: hostId,
				game: options.game.name,
				config: options.config,
			});

			for (const id of playerIds.slice(1)) {
				await bame.lobbies.join({ userId: id, lobbyId: lobby.id });
			}

			const match = await bame.lobbies.start({
				userId: hostId,
				lobbyId: lobby.id,
			});

			let currentTerminalHolder: string | null = null;

			while (true) {
				const publicCheck = await bame.matches.get<TView>(match.id, null);
				if (!publicCheck) break;

				if (publicCheck.status === 'finished') {
					const finalView = await bame.matches.get<TView>(
						match.id,
						publicCheck.turn.currentPlayerId,
					);
					if (finalView) {
						helpers.print('');
						options.render(finalView, helpers);
					}
					helpers.print('');
					helpers.print(formatMatchResultBanner(publicCheck));
					break;
				}

				const activePlayerId = publicCheck.turn.currentPlayerId;

				if (
					options.passAndPlay &&
					playerIds.length > 1 &&
					activePlayerId !== currentTerminalHolder
				) {
					helpers.clear();
					helpers.print('');
					helpers.print(
						formatBox(
							`Pass the terminal to ${c.bold(c.yellow(activePlayerId))} and press ${c.bold('[Enter]')}`,
							{ title: c.yellow('🔒 Pass & Play'), color: c.yellow },
						),
					);
					await helpers.ask('');
					currentTerminalHolder = activePlayerId;
				}

				const playerView = await bame.matches.get<TView>(
					match.id,
					activePlayerId,
				);
				if (!playerView) break;

				helpers.print('');
				options.render(playerView, helpers);

				let moveSucceeded = false;
				while (!moveSucceeded) {
					await options.onTurn({
						...helpers,
						view: playerView,
						playerId: activePlayerId,
						move: async (moveName, ...args) => {
							const res = await bame.matches.move<TView, TMoves>({
								userId: activePlayerId,
								matchId: match.id,
								move: moveName,
								args,
							});
							if (res.ok) {
								moveSucceeded = true;
							} else {
								helpers.print(c.red(`  ✖ Invalid move: ${res.error}`));
							}
							return res;
						},
					});
				}
			}

			const leaderboard = await bame.profiles.list();
			helpers.print(formatLeaderboard(leaderboard));

			const answer = await helpers.ask(
				`\n${c.cyan('?')} Play another round? ${c.dim('(y/n) [y]')}: `,
			);
			playAgain = answer === '' || answer.toLowerCase().startsWith('y');
		}
	} finally {
		rl.close();
	}
};
