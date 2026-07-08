import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { Footer } from './Footer';

export default {
	title: 'owncast/Layout/Footer',
	component: Footer,
} as Meta<typeof Footer>;

const Template: StoryFn<typeof Footer> = args => <Footer {...args} />;

export const Example = Template.bind({});
Example.args = {
	version: 'v1.2.3',
};
