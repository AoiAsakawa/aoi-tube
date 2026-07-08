import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { IndieAuthModal } from './IndieAuthModal';
import Mock from '../../../stories/assets/mocks/indieauth-modal.png';

const Example = () => (
	<div>
		<IndieAuthModal authenticated displayName="fakeChatName" accessToken="fakeaccesstoken" />
	</div>
);

export default {
	title: 'owncast/Modals/IndieAuth',
	component: IndieAuthModal,
	parameters: {
		design: {
			type: 'image',
			url: Mock,
			scale: 0.5,
		},
	},
} as Meta<typeof IndieAuthModal>;

const Template: StoryFn<typeof IndieAuthModal> = () => <Example />;

export const Basic = Template.bind({});
