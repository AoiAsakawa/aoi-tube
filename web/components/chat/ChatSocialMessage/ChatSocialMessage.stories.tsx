import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { ChatSocialMessage } from './ChatSocialMessage';

export default {
	title: 'owncast/Chat/Messages/Social-fediverse event',
	component: ChatSocialMessage,
} as Meta<typeof ChatSocialMessage>;

const Template: StoryFn<typeof ChatSocialMessage> = args => <ChatSocialMessage {...args} />;

export const Follow = Template.bind({});
Follow.args = {
	message: {
		type: 'FEDIVERSE_ENGAGEMENT_FOLLOW',
		body: '<p>james followed this live stream.</p>',
		title: 'james@mastodon.social',
		image: 'https://mastodon.social/avatars/original/missing.png',
		link: 'https://mastodon.social/@james',
	},
};

export const Like = Template.bind({});
Like.args = {
	message: {
		type: 'FEDIVERSE_ENGAGEMENT_LIKE',
		body: '<p>james liked that this stream went live.</p>',
		title: 'james@mastodon.social',
		image: 'https://mastodon.social/avatars/original/missing.png',
		link: 'https://mastodon.social/@james',
	},
};

export const Repost = Template.bind({});
Repost.args = {
	message: {
		type: 'FEDIVERSE_ENGAGEMENT_REPOST',
		body: '<p>james shared this stream with their followers.</p>',
		title: 'james@mastodon.social',
		image: 'https://mastodon.social/avatars/original/missing.png',
		link: 'https://mastodon.social/@james',
	},
};

export const LongAccountName = Template.bind({});
LongAccountName.args = {
	message: {
		type: 'FEDIVERSE_ENGAGEMENT_REPOST',
		body: '<p>james shared this stream with their followers.</p>',
		title: 'littlejimmywilliams@technology.biz.net.org.technology.gov',
		image: 'https://mastodon.social/avatars/original/missing.png',
		link: 'https://mastodon.social/@james',
	},
};

export const InvalidAvatarImage = Template.bind({});
InvalidAvatarImage.args = {
	message: {
		type: 'FEDIVERSE_ENGAGEMENT_REPOST',
		body: '<p>james shared this stream with their followers.</p>',
		title: 'james@mastodon.social',
		image: 'https://xx.xx/avatars/original/missing.png',
		link: 'https://mastodon.social/@james',
	},
};
