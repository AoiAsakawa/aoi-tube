import { FlatCompat } from '@eslint/eslintrc';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginStorybook from 'eslint-plugin-storybook';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

export default tseslint.config(
	// Base config
	eslint.configs.recommended,
	...tseslint.configs.recommended,

	// Prettier integration
	...compat.extends('prettier'),

	// Storybook設定
	...pluginStorybook.configs['flat/recommended'],

	// グローバル設定
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2024,
			},
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
	},

	// TypeScriptファイル用ルール
	{
		files: ['**/*.ts', '**/*.tsx'],
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-wrapper-object-types': 'off',
			'@typescript-eslint/consistent-type-imports': 'off',
		},
	},

	// JavaScriptファイル用ルール
	{
		files: ['**/*.js', '**/*.jsx'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'no-unused-vars': 'off',
		},
	},

	// React/JSXファイル用ルール
	{
		files: ['**/*.jsx', '**/*.tsx'],
		plugins: {
			react: pluginReact,
			'react-hooks': pluginReactHooks,
			'jsx-a11y': pluginJsxA11y,
		},
		rules: {
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
			'react/display-name': 'off',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'off',
			'jsx-a11y/alt-text': 'warn',
		},
	},

	// Storybook用設定
	{
		files: ['**/*.stories.@(ts|tsx|js|jsx)'],
		rules: {
			'storybook/default-exports': 'error',
			'storybook/hierarchy-separator': 'warn',
		},
	},

	// テストファイル用設定
	{
		files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
		languageOptions: {
			globals: {
				...globals.jest,
			},
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},

	// 除外設定
	{
		ignores: [
			'.next/**',
			'out/**',
			'node_modules/**',
			'dist/**',
			'.storybook/**',
			'coverage/**',
			'*.config.js',
			'*.config.mjs',
			'public/**',
			'style-definitions/**',
			'storybook-static/**',
			'next-env.d.ts',
		],
	},
);
