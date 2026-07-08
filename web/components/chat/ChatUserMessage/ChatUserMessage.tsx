import { FC, ReactNode } from 'react';
import cn from 'classnames';
import { Tooltip } from 'antd';
import dynamic from '@components/compat/dynamic';
import { Interweave } from 'interweave';
import { UrlMatcher } from 'interweave-autolink';
import { ChatMessageHighlightMatcher } from './customMatcher';
import styles from './ChatUserMessage.module.scss';
import { formatTimestamp } from './messageFmt';
import { ChatMessage } from '../../../interfaces/chat-message.model';
import { useAccessToken } from '../../stores/zustand-store';
import { User } from '../../../interfaces/user.model';
import { AuthedUserBadge } from '../ChatUserBadge/AuthedUserBadge';
import { ModerationBadge } from '../ChatUserBadge/ModerationBadge';
import { BotUserBadge } from '../ChatUserBadge/BotUserBadge';
import { TwitterAuthBadge } from '../ChatUserBadge/TwitterAuthBadge';
import { DiscordAuthBadge } from '../ChatUserBadge/DiscordAuthBadge';
import { XAuthBadge } from '../ChatUserBadge/XAuthBadge';
import { GoogleAuthBadge } from '../ChatUserBadge/GoogleAuthBadge';

// Lazy loaded components

const ChatModerationActionMenu = dynamic(
	() =>
		import('../ChatModerationActionMenu/ChatModerationActionMenu').then(
			mod => mod.ChatModerationActionMenu,
		),
	{
		ssr: false,
	},
);

export type ChatUserMessageProps = {
	message: ChatMessage;
	showModeratorMenu: boolean;
	highlightString: string;
	sentBySelf: boolean;
	sameUserAsLast: boolean;
	isAuthorModerator: boolean;
	isAuthorAuthenticated: boolean;
	isAuthorBot: boolean;
	authorAuthType?: string;
};

export type UserTooltipProps = {
	user: User;
	children: ReactNode;
};

const UserTooltip: FC<UserTooltipProps> = ({ children, user }) => {
	const { displayName, createdAt } = user;
	const content = `${displayName} first joined ${formatTimestamp(createdAt)}`;

	return (
		<Tooltip title={content} placement="topLeft" mouseEnterDelay={1}>
			{children}
		</Tooltip>
	);
};

export const ChatUserMessage: FC<ChatUserMessageProps> = ({
	message,
	highlightString,
	showModeratorMenu,
	sentBySelf, // Move the border to the right and render a background
	sameUserAsLast,
	isAuthorModerator,
	isAuthorAuthenticated,
	isAuthorBot,
	authorAuthType,
}) => {
	const { id: messageId, body, user, timestamp } = message;
	const { id: userId, displayName, displayColor } = user;
	const accessToken = useAccessToken();

	const color = `var(--theme-color-users-${displayColor})`;
	const formattedTimestamp = `Sent ${formatTimestamp(timestamp)}`;

	const badgeNodes = [];
	if (isAuthorModerator) {
		badgeNodes.push(<ModerationBadge key="mod" userColor={displayColor} />);
	}
	// Show auth badge based on auth type
	if (isAuthorAuthenticated) {
		if (authorAuthType === 'twitter') {
			badgeNodes.push(<TwitterAuthBadge key="twitter" userColor={displayColor} />);
		} else if (authorAuthType === 'discord') {
			badgeNodes.push(<DiscordAuthBadge key="discord" userColor={displayColor} />);
		} else if (authorAuthType === 'x') {
			badgeNodes.push(<XAuthBadge key="x" />);
		} else if (authorAuthType === 'google') {
			badgeNodes.push(<GoogleAuthBadge key="google" userColor={displayColor} />);
		} else {
			badgeNodes.push(<AuthedUserBadge key="auth" userColor={displayColor} />);
		}
	}
	if (isAuthorBot) {
		badgeNodes.push(<BotUserBadge key="bot" userColor={displayColor} />);
	}
	return (
		<div
			className={cn(
				styles.messagePadding,
				sameUserAsLast && styles.messagePaddingCollapsed,
				'chat-message_user',
			)}
		>
			<div
				className={cn(styles.root, {
					[styles.ownMessage]: sentBySelf,
				})}
				style={{ borderColor: color }}
			>
				<div className={styles.background} style={{ color }} />

				{!sameUserAsLast && (
					<UserTooltip user={user}>
						<div className={styles.user} style={{ color }}>
							<span className={styles.userName}>{displayName}</span>
							{badgeNodes}
						</div>
					</UserTooltip>
				)}
				<Tooltip title={formattedTimestamp} mouseEnterDelay={1}>
					<Interweave
						className={styles.message}
						content={body}
						matchers={[
							new UrlMatcher('url', { validateTLD: false }),
							new ChatMessageHighlightMatcher('highlight', { highlightString }),
						]}
					/>
				</Tooltip>
				{showModeratorMenu && (
					<div className={styles.modMenuWrapper}>
						<ChatModerationActionMenu
							messageID={messageId}
							accessToken={accessToken}
							userID={userId}
							userDisplayName={displayName}
						/>
					</div>
				)}
			</div>
		</div>
	);
};
