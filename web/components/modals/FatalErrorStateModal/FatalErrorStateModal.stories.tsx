import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { FatalErrorStateModal } from './FatalErrorStateModal';

export default {
	title: 'owncast/Modals/Global error state',
	component: FatalErrorStateModal,
} as Meta<typeof FatalErrorStateModal>;

const Template: StoryFn<typeof FatalErrorStateModal> = args => <FatalErrorStateModal {...args} />;

export const Example = Template.bind({});
Example.args = {
	title: 'Example error title',
	message: 'Example error message',
};
