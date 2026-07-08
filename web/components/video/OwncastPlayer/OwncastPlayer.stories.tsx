import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { OwncastPlayer } from './OwncastPlayer';

const streams = {
	DemoServer: `https://watch.owncast.online/hls/stream.m3u8`,
	RetroStrangeTV: `https://live.retrostrange.com/hls/stream.m3u8`,
	localhost: `http://localhost:8080/hls/stream.m3u8`,
};

export default {
	title: 'owncast/Player/Player',
	component: OwncastPlayer,

	argTypes: {
		source: {
			options: Object.keys(streams),
			mapping: streams,
			control: {
				type: 'select',
			},
		},
	},
} as Meta<typeof OwncastPlayer>;

const Template: StoryFn<typeof OwncastPlayer> = args => <OwncastPlayer {...args} />;

export const LiveDemo = Template.bind({});
LiveDemo.args = {
	online: true,
	source: 'https://watch.owncast.online/hls/stream.m3u8',
	title: 'Stream title',
};
