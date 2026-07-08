import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { ChatModeratorNotification } from './ChatModeratorNotification';

export default {
	title: 'owncast/Chat/Messages/Moderation Role Notification',
	component: ChatModeratorNotification,
} as Meta<typeof ChatModeratorNotification>;

const Template: StoryFn<typeof ChatModeratorNotification> = (args: object) => (
	<ChatModeratorNotification {...args} />
);

export const Basic = Template.bind({});
