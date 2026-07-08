import { Spin } from 'antd';
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { useAppStore } from '../../stores/zustand-store';

import { ChatMessage } from '../../../interfaces/chat-message.model';
import styles from './Sidebar.module.scss';

// Lazy loaded components
const ChatContainer = dynamic(
	() => import('../../chat/ChatContainer/ChatContainer').then(mod => mod.ChatContainer),
	{
		ssr: false,
	},
);

// Define static selectors (stable references)
const selectCurrentUser = (s: ReturnType<typeof useAppStore.getState>) => s.currentUser;
const selectChatMessages = (s: ReturnType<typeof useAppStore.getState>) => s.chatMessages;
const selectHiddenMessageIds = (s: ReturnType<typeof useAppStore.getState>) => s.hiddenMessageIds;
const selectAccessToken = (s: ReturnType<typeof useAppStore.getState>) => s.accessToken;
const selectAppState = (s: ReturnType<typeof useAppStore.getState>) => s.appState;

export const Sidebar: FC = () => {
	const { t } = useTranslation();
	const currentUser = useAppStore(selectCurrentUser);
	const chatMessages = useAppStore(selectChatMessages);
	const hiddenMessageIds = useAppStore(selectHiddenMessageIds);
	const accessToken = useAppStore(selectAccessToken);
	const appState = useAppStore(selectAppState);

	// Memoize computed values
	// Cast to ChatMessage (SocketEvent is the base type of ChatMessage)
	const messages = useMemo(
		() => (chatMessages as ChatMessage[]).filter(message => !hiddenMessageIds.includes(message.id)),
		[chatMessages, hiddenMessageIds],
	);

	const isChatAvailable = useMemo(
		() => !!(accessToken && appState?.chatAvailable),
		[accessToken, appState?.chatAvailable],
	);

	if (!currentUser) {
		return (
			<aside className={`${styles.root} ${styles.loading}`}>
				<Spin spinning size="large" />
			</aside>
		);
	}

	const { id, isModerator, displayName } = currentUser;
	return (
		<aside className={styles.root}>
			{/* Slim column header so the docked chat reads as a labeled panel
			    instead of an unexplained empty strip. */}
			<div className={styles.panelHeader}>{t('chat.title')}</div>
			{/* Flex-fill wrapper: the chat container sizes itself to 100% of its
			    parent, so without this the header's height pushed the input row
			    below the viewport. */}
			<div className={styles.panelBody}>
				<ChatContainer
					messages={messages}
					usernameToHighlight={displayName}
					chatUserId={id}
					isModerator={isModerator}
					chatAvailable={isChatAvailable}
					showInput={!!currentUser}
				/>
			</div>
		</aside>
	);
};
