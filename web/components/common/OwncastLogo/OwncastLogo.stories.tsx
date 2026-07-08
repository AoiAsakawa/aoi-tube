import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { OwncastLogo } from './OwncastLogo';

export default {
	title: 'owncast/Components/Header Logo',
	component: OwncastLogo,
	parameters: {
		chromatic: { diffThreshold: 0.8 },
	},
} as Meta<typeof OwncastLogo>;

const Template: StoryFn<typeof OwncastLogo> = args => <OwncastLogo {...args} />;

export const Logo = Template.bind({});
Logo.args = {
	url: '/logo',
};

export const DemoServer = Template.bind({});
DemoServer.args = {
	url: 'https://watch.owncast.online/logo',
};
