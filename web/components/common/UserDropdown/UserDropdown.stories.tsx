import React, { useEffect } from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { useSetCurrentUser } from '../../stores/zustand-store';
import { UserDropdown } from './UserDropdown';

export default {
	title: 'owncast/Components/User settings menu',
	component: UserDropdown,
} as Meta<typeof UserDropdown>;

// Seed the current user in the Zustand store before rendering.
const Example = args => {
	const setCurrentUser = useSetCurrentUser();

	useEffect(
		() =>
			setCurrentUser({
				id: '1',
				displayName: 'Test User',
				displayColor: 3,
				isModerator: false,
			}),
		[],
	);

	return <UserDropdown id="user-menu" {...args} />;
};

const Template: StoryFn<typeof UserDropdown> = args => <Example {...args} />;

export const ChatEnabled = Template.bind({});
ChatEnabled.args = {
	username: 'test-user',
};
