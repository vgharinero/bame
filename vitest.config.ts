import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: { dedupe: ['react', 'react-dom', '@bame/core'] },
	test: {
		globals: true,
	},
});
