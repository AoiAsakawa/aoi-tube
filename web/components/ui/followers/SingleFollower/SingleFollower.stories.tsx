import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { SingleFollower } from './SingleFollower';
import SingleFollowerMock from '../../../../stories/assets/mocks/single-follower.png';

export default {
	title: 'owncast/Components/Followers/Single Follower',
	component: SingleFollower,
	parameters: {
		design: {
			type: 'image',
			url: SingleFollowerMock,
		},
		docs: {
			description: {
				component: `Represents a single follower.`,
			},
		},
	},
} as Meta<typeof SingleFollower>;

const Template: StoryFn<typeof SingleFollower> = args => <SingleFollower {...args} />;

export const Example = Template.bind({});
Example.args = {
	follower: {
		name: 'John Doe',
		description: 'User',
		username: '@account@domain.tld',
		image: 'https://avatars0.githubusercontent.com/u/1234?s=460&v=4',
		link: 'https://yahoo.com',
	},
};
