import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { ActionButtonMenu } from './ActionButtonMenu';

export default {
	title: 'owncast/Components/Action Buttons/Action Menu',
	component: ActionButtonMenu,
} as Meta<typeof ActionButtonMenu>;

const itemSelected = a => {
	console.log('itemSelected', a);
	action(a.title);
};

const Template: StoryFn<typeof ActionButtonMenu> = args => (
	<ActionButtonMenu {...args} externalActionSelected={a => itemSelected(a)} />
);

const actions = [
	{
		url: 'https://owncast.online/docs',
		title: 'Documentation',
		description: 'AoiTube Documentation',
		icon: 'https://owncast.online/images/logo.svg',
		color: '#5232c8',
		openExternally: false,
	},
	{
		url: 'https://opencollective.com/embed/owncast/donate',
		title: 'Support AoiTube',
		description: 'Contribute to AoiTube',
		icon: 'https://opencollective.com/static/images/opencollective-icon.svg',
		color: '#2b4863',
		openExternally: false,
	},
];

export const Example = Template.bind({});
Example.args = {
	actions,
};

export const ShowFollowExample = Template.bind({});
ShowFollowExample.args = {
	actions,
	showFollowItem: true,
};

export const ShowNotifyExample = Template.bind({});
ShowNotifyExample.args = {
	actions,
	showNotifyItem: true,
};

export const ShowNotifyAndFollowExample = Template.bind({});
ShowNotifyAndFollowExample.args = {
	actions,
	showNotifyItem: true,
	showFollowItem: true,
};
