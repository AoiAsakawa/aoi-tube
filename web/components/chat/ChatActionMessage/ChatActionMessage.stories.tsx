import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { ChatActionMessage } from './ChatActionMessage';
import Mock from '../../../stories/assets/mocks/chatmessage-action.png';

export default {
	title: 'owncast/Chat/Messages/Chat action',
	component: ChatActionMessage,
	parameters: {
		design: {
			type: 'image',
			url: Mock,
		},
		docs: {
			description: {
				component: `This is the message design an action takes place, such as a join or a name change.`,
			},
		},
	},
} as Meta<typeof ChatActionMessage>;

const Template: StoryFn<typeof ChatActionMessage> = args => <ChatActionMessage {...args} />;

export const Basic = Template.bind({});
Basic.args = {
	body: 'This is a basic action message.',
};
