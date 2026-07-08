import React, { useEffect } from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { useSetCurrentUser } from '../../stores/zustand-store';
import { NameChangeModal } from './NameChangeModal';

export default {
	title: 'owncast/Modals/Name Change',
	component: NameChangeModal,
} as Meta<typeof NameChangeModal>;

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
			<NameChangeModal />
		</div>
	);
};

const Template: StoryFn<typeof NameChangeModal> = () => <Example />;

export const Basic = Template.bind({});
