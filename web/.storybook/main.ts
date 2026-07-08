import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
	stories: [
		'../stories/**/*.stories.@(js|jsx|ts|tsx)',
		'../components/**/*.stories.@(js|jsx|ts|tsx)',
		'../pages/**/*.stories.@(js|jsx|ts|tsx)',
	],
	addons: ['@storybook/addon-links', '@storybook/addon-docs'],
	framework: {
		name: '@storybook/react-vite',
		options: {},
	},
	staticDirs: ['../public', '../../static'],
	docs: {},
	typescript: {
		reactDocgen: 'react-docgen-typescript',
	},
};

export default config;
