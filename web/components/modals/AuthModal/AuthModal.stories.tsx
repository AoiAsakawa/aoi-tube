import React, { useEffect } from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { useSetCurrentUser } from '../../stores/zustand-store';
import { AuthModal } from './AuthModal';

const Example = () => {
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

	return (
		<div>
			<AuthModal forceTabs />
		</div>
	);
};

export default {
	title: 'owncast/Modals/Auth',
	component: AuthModal,
} as Meta<typeof AuthModal>;

const Template: StoryFn<typeof AuthModal> = () => <Example />;

export const Basic = Template.bind({});
