import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { ChatNameChangeMessage } from './ChatNameChangeMessage';

export default {
	title: 'owncast/Chat/Messages/Chat name change',
	component: ChatNameChangeMessage,
} as Meta<typeof ChatNameChangeMessage>;

const Template: StoryFn<typeof ChatNameChangeMessage> = args => <ChatNameChangeMessage {...args} />;

export const Basic = Template.bind({});
Basic.args = {
	message: {
		oldName: 'JohnnyOldName',
		user: {
			displayName: 'JohnnyNewName',
			displayColor: '3',
		},
	},
};
