import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		exclude: ['node_modules', '.next', 'cypress'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', '.next/', '**/*.stories.{js,jsx,ts,tsx}', '**/*.d.ts'],
		},
	},
	resolve: {
		// Keep in sync with the "paths" entries in tsconfig.json.
		alias: {
			'@components': path.resolve(__dirname, 'components'),
			'@utils': path.resolve(__dirname, 'utils'),
			'@services': path.resolve(__dirname, 'services'),
			'@': path.resolve(__dirname, '.'),
		},
	},
});
