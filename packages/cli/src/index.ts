#!/usr/bin/env node

import { Command } from 'commander';
import { cpSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Templates are at the package root (sibling to dist/)
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

const program = new Command();

program
  .name('bame')
  .description('CLI for scaffolding <⏰ Bame> game projects')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new <⏰ Bame> project in the current directory')
  .argument('<name>')
  .option('--test', 'Skip install and git')
  .option('--skip-migrations', 'Skip copying Supabase migrations')
  .option('--skip-pages', 'Skip copying Next.js pages')
  .action(async (name, options) => {
    const cwd = process.cwd();

    console.log(`🎮 Initializing bame project "${name}" in ${cwd}`);

    // 0. Create Next.js project structure if not skipped
    const { execSync } = await import('child_process');
    try {
      console.log('🚀 Creating Next.js project structure...');
      let bashCommand = `npx create-next-app@latest ${name} --ts --tailwind --biome --app --src-dir --empty --react-compiler`;
      if (options.test) {
        console.log('⚠️  Test mode: skipping install and git, using pnpm');
        bashCommand += ' --use-pnpm --skip-install --disable-git';
      }
      execSync(bashCommand, { stdio: 'inherit' });
      console.log('✅ Next.js project structure created');
    } catch (error) {
      console.error('❌ Failed to create Next.js project structure:', error);
      process.exit(1);
    }

    // // 1. Copy Supabase migrations
    // if (!options.skipMigrations) {
    //   const migrationsSource = join(TEMPLATES_DIR, 'supabase', 'migrations');
    //   const migrationsDest = join(cwd, 'supabase', 'migrations');

    //   if (!existsSync(migrationsDest)) {
    //     mkdirSync(migrationsDest, { recursive: true });
    //   }

    //   cpSync(migrationsSource, migrationsDest, { recursive: true });
    //   console.log('✅ Copied Supabase migrations to supabase/migrations/');
    // }

    // // 2. Copy Next.js pages
    // if (!options.skipPages) {
    //   const pages = [
    //     { src: 'app/login/page.tsx.template', dest: 'app/login/page.tsx' },
    //     { src: 'app/signup/page.tsx.template', dest: 'app/signup/page.tsx' },
    //     { src: 'app/lobby/page.tsx.template', dest: 'app/lobby/page.tsx' },
    //     {
    //       src: 'app/game/[id]/page.tsx.template',
    //       dest: 'app/game/[id]/page.tsx',
    //     },
    //   ];

    //   for (const page of pages) {
    //     const sourcePath = join(TEMPLATES_DIR, page.src);
    //     const destPath = join(cwd, page.dest);
    //     const destDir = dirname(destPath);

    //     if (!existsSync(destDir)) {
    //       mkdirSync(destDir, { recursive: true });
    //     }

    //     const content = readFileSync(sourcePath, 'utf-8');
    //     writeFileSync(destPath, content);
    //     console.log(`✅ Created ${page.dest}`);
    //   }
    // }

    // // 3. Copy game definition template
    // const gameDefSource = join(
    //   TEMPLATES_DIR,
    //   'lib',
    //   'game-definition.ts.template',
    // );
    // const gameDefDest = join(cwd, 'lib', 'game.ts');

    // if (!existsSync(gameDefDest)) {
    //   const destDir = dirname(gameDefDest);
    //   if (!existsSync(destDir)) {
    //     mkdirSync(destDir, { recursive: true });
    //   }
    //   const content = readFileSync(gameDefSource, 'utf-8');
    //   writeFileSync(gameDefDest, content);
    //   console.log('✅ Created lib/game.ts (game definition template)');
    // } else {
    //   console.log('⏭️  Skipped lib/game.ts (already exists)');
    // }

    // 4. Copy env template
    const envSource = join(TEMPLATES_DIR, 'env.example');
    const envDest = join(cwd, '.env.example');

    if (!existsSync(envDest)) {
      cpSync(envSource, envDest);
      console.log('✅ Created .env.example');
    } else {
      console.log('⏭️  Skipped .env.example (already exists)');
    }

    console.log('\n🎉 Done! Next steps:');
    console.log(
      '   1. Copy .env.example to .env.local and fill in your Supabase credentials',
    );
    console.log('   2. Run: npx supabase db push');
    console.log('   3. Edit lib/game.ts with your game logic');
    console.log(
      '   4. Install dependencies: pnpm add @bame/core @bame/next-supabase',
    );
  });

program.parse();
