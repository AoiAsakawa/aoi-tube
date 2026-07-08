import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { SocialLinks } from './SocialLinks';

export default {
	title: 'owncast/Components/Social links',
	component: SocialLinks,
} as Meta<typeof SocialLinks>;

const Template: StoryFn<typeof SocialLinks> = args => <SocialLinks {...args} />;

export const Populated = Template.bind({});
Populated.args = {
	links: [
		{
			platform: 'github',
			url: 'https://github.com/AoiAsakawa/aoitube',
			icon: '/img/platformlogos/github.svg',
		},
		{
			platform: 'Documentation',
			url: 'https://owncast.online',
			icon: '/img/platformlogos/link.svg',
		},
		{
			platform: 'mastodon',
			url: 'https://fosstodon.org/users/owncast',
			icon: '/img/platformlogos/mastodon.svg',
		},
	],
};

export const Empty = Template.bind({});
Empty.args = {
	links: [],
};
