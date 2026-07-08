import type { Preview } from '@storybook/react';
import { themes } from 'storybook/theming';
import '../styles/variables.css';
import '../styles/global.less';
import '../styles/theme.less';
import './preview.scss';

const INITIAL_VIEWPORTS = {
	iphone5: {
		name: 'iPhone 5',
		styles: { width: '320px', height: '568px' },
		type: 'mobile',
	},
	iphone6: {
		name: 'iPhone 6',
		styles: { width: '375px', height: '667px' },
		type: 'mobile',
	},
	ipad: {
		name: 'iPad',
		styles: { width: '768px', height: '1024px' },
		type: 'tablet',
	},
	ipad12p: {
		name: 'iPad Pro 12.9-inch',
		styles: { width: '1024px', height: '1366px' },
		type: 'tablet',
	},
};

type ViewportEntry = [string, (typeof INITIAL_VIEWPORTS)[keyof typeof INITIAL_VIEWPORTS]];

const convertToLandscapeAndPortraitEntries = ([
	objectKey,
	viewport,
]: ViewportEntry): ViewportEntry[] => {
	const pixelStringToNumber = (str: string) => parseInt(str.split('px')[0]);
	const dimensions = [viewport.styles.width, viewport.styles.height].map(pixelStringToNumber);
	const minDimension = Math.min(...dimensions);
	const maxDimension = Math.max(...dimensions);

	return [
		[
			`${objectKey}Portrait`,
			{
				...viewport,
				name: viewport.name + ' (Portrait)',
				styles: {
					...viewport.styles,
					height: maxDimension + 'px',
					width: minDimension + 'px',
				},
			},
		],
		[
			`${objectKey}Landscape`,
			{
				...viewport,
				name: viewport.name + ' (Landscape)',
				styles: {
					...viewport.styles,
					height: minDimension + 'px',
					width: maxDimension + 'px',
				},
			},
		],
	];
};

const flatMapObject = <K extends string, V, NK extends string, NV>(
	obj: Record<K, V>,
	f: (entry: [K, V]) => Array<[NK, NV]>,
): Record<NK, NV> =>
	Object.fromEntries((Object.entries(obj) as Array<[K, V]>).flatMap(f)) as Record<NK, NV>;

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		docs: {
			theme: themes.dark,
		},
		viewport: {
			options: flatMapObject(INITIAL_VIEWPORTS, convertToLandscapeAndPortraitEntries),
		},
		backgrounds: {
			options: {
				dark: { name: 'dark', value: '#171523' },
				light: { name: 'light', value: '#ffffff' },
			},
		},
	},

	tags: ['autodocs'],

	initialGlobals: {
		backgrounds: {
			value: 'dark',
		},
	},
};

export default preview;
