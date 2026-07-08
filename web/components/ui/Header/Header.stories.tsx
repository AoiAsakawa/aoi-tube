import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { Header } from './Header';

export default {
	title: 'owncast/Layout/Header',
	component: Header,
	parameters: {
		chromatic: { diffThreshold: 0.75 },
	},
} as Meta<typeof Header>;

const Template: StoryFn<typeof Header> = args => <Header {...args} />;

export const ChatAvailable = Template.bind({});
ChatAvailable.args = {
	name: 'Example Stream Name',
	chatAvailable: true,
};

export const ChatNotAvailable = Template.bind({});
ChatNotAvailable.args = {
	name: 'Example Stream Name',
	chatAvailable: false,
};
