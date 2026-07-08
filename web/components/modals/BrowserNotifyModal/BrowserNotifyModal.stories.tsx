import React from 'react';
import type { Meta, StoryFn } from '@storybook/react-vite';
import { BrowserNotifyModal } from './BrowserNotifyModal';
import BrowserNotifyModalMock from '../../../stories/assets/mocks/notify-modal.png';

const Example = () => (
	<div>
		<BrowserNotifyModal />
	</div>
);

export default {
	title: 'owncast/Modals/Browser Notifications',
	component: BrowserNotifyModal,
	parameters: {
		chromatic: { diffThreshold: 0.9 },
		design: {
			type: 'image',
			url: BrowserNotifyModalMock,
			scale: 0.5,
		},
		docs: {
			description: {
				component: `The notify modal allows an end user to get notified when the stream goes live via [Browser Push Notifications](https://developers.google.com/web/ilt/pwa/introduction-to-push-notifications) It must:

- Verify the browser supports notifications.
- Handle errors that come back from the server.
- Have an enabled and disabled state with accurate information about each.
`,
			},
		},
	},
} as Meta<typeof BrowserNotifyModal>;

const Template: StoryFn<typeof BrowserNotifyModal> = () => <Example />;

export const Basic = Template.bind({});
