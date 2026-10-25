#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import {
	CONSOLE_PLAY_TEMPLATE,
	createPackageJson,
	createTsconfigJson,
	GAME_TEMPLATE,
	REACT_APP_TEMPLATE,
} from './templates.js';

const program = new Command();

program
	.name('bame')
	.description('CLI for scaffolding playable Bame turn-based games')
	.version('0.2.0');

program
	.command('init')
	.description('Initialize a new playable Bame project')
	.argument('<name>', 'Project directory name')
	.option(
		'-t, --template <type>',
		'Project template: "console" or "react"',
		'console',
	)
	.action((name: string, options: { template: string }) => {
		if (options.template !== 'console' && options.template !== 'react') {
			console.error(
				`Unknown template "${options.template}". Expected "console" or "react".`,
			);
			process.exit(1);
		}

		const isReact = options.template === 'react';
		const targetDir = path.resolve(process.cwd(), name);
		if (fs.existsSync(targetDir)) {
			console.error(`Directory "${name}" already exists.`);
			process.exit(1);
		}

		const srcDir = path.join(targetDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		fs.writeFileSync(path.join(srcDir, 'game.ts'), GAME_TEMPLATE, 'utf-8');
		if (isReact) {
			fs.writeFileSync(
				path.join(srcDir, 'App.tsx'),
				REACT_APP_TEMPLATE,
				'utf-8',
			);
		} else {
			fs.writeFileSync(
				path.join(srcDir, 'play.ts'),
				CONSOLE_PLAY_TEMPLATE,
				'utf-8',
			);
		}

		const bundledAgentsMd = new URL('../AGENTS.md', import.meta.url);
		fs.copyFileSync(bundledAgentsMd, path.join(targetDir, 'AGENTS.md'));

		fs.writeFileSync(
			path.join(targetDir, 'tsconfig.json'),
			JSON.stringify(createTsconfigJson(isReact), null, 2),
			'utf-8',
		);

		fs.writeFileSync(
			path.join(targetDir, 'package.json'),
			JSON.stringify(createPackageJson(name, isReact), null, 2),
			'utf-8',
		);

		console.log(`Created Bame (${options.template}) project in ${targetDir}`);
		console.log(
			isReact
				? `Next steps:\n  cd ${name}\n  pnpm install\n  # Import src/App.tsx into your Vite or Next.js entry point`
				: `Next steps:\n  cd ${name}\n  pnpm install\n  pnpm play`,
		);
	});

program.parse();
