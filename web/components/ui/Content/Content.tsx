import { Skeleton, Button } from 'antd';
import MessageFilled from '@ant-design/icons/MessageFilled';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import classnames from 'classnames';
import ActionButtons from './ActionButtons';
import { LOCAL_STORAGE_KEYS, getLocalStorage, setLocalStorage } from '../../../utils/localStorage';
import isPushNotificationSupported from '../../../utils/browserPushNotifications';
import { useMediaQuery } from '../../../utils/use-media-query';

import {
	useClientConfig,
	useChatMessages,
	useCurrentUser,
	useIsChatVisible,
	useAppState,
	useIsOnline,
	useIsMobile,
	useSetIsMobile,
	useServerStatus,
	useIsChatAvailable,
	useChatAuthenticated,
} from '../../stores/zustand-store';

import styles from './Content.module.scss';
import { Sidebar } from '../Sidebar/Sidebar';
import { OfflineBanner } from '../OfflineBanner/OfflineBanner';
import { Statusbar } from '../Statusbar/Statusbar';
import { ChatMessage } from '../../../interfaces/chat-message.model';
import { ExternalAction } from '../../../interfaces/external-action';
import { Modal } from '../Modal/Modal';
import { DesktopContent } from './DesktopContent';
import { ContentHeader } from '../../common/ContentHeader/ContentHeader';
import { MobileContent } from './MobileContent';
import { ChatModal } from '../../modals/ChatModal/ChatModal';

// Lazy loaded components

const FollowModal = dynamic(
	() => import('../../modals/FollowModal/FollowModal').then(mod => mod.FollowModal),
	{
		ssr: false,
		loading: () => <Skeleton loading active paragraph={{ rows: 8 }} />,
	},
);

const BrowserNotifyModal = dynamic(
	() =>
		import('../../modals/BrowserNotifyModal/BrowserNotifyModal').then(
			mod => mod.BrowserNotifyModal,
		),
	{
		ssr: false,
		loading: () => <Skeleton loading active paragraph={{ rows: 6 }} />,
	},
);

const OwncastPlayer = dynamic(
	() => import('../../video/OwncastPlayer/OwncastPlayer').then(mod => mod.OwncastPlayer),
	{
		ssr: false,
		loading: () => <div className={styles.playerPlaceholder} />,
	},
);

// Only loaded when a viewer opts into the experimental low-latency (WebRTC)
// player, so the WebRTC signaling code stays out of the default bundle.
const WebRTCPlayer = dynamic(
	() => import('../../video/WebRTCPlayer/WebRTCPlayer').then(mod => mod.WebRTCPlayer),
	{
		ssr: false,
		loading: () => <div className={styles.playerPlaceholder} />,
	},
);

// Strip of recent stream recordings. It renders nothing until the archive
// list loads non-empty, so no loading skeleton is needed.
const ArchivesRow = dynamic(
	() => import('../ArchivesRow/ArchivesRow').then(mod => mod.ArchivesRow),
	{ ssr: false },
);

const ExternalModal = ({ externalActionToDisplay, setExternalActionToDisplay }) => {
	const { title, description, url, html } = externalActionToDisplay;
	return (
		<Modal
			title={description || title}
			url={url}
			open={!!externalActionToDisplay}
			height="80vh"
			handleCancel={() => setExternalActionToDisplay(null)}
		>
			{html ? (
				<div
					dangerouslySetInnerHTML={{ __html: html }}
					style={{
						height: '100%',
						width: '100%',
						overflow: 'auto',
					}}
				/>
			) : null}
		</Modal>
	);
};

export const Content: FC = () => {
	const { t } = useTranslation();
	const appState = useAppState();
	const clientConfig = useClientConfig();
	const isChatVisible = useIsChatVisible();
	const currentUser = useCurrentUser();
	const serverStatus = useServerStatus();
	const isMobile = useIsMobile();
	const setIsMobile = useSetIsMobile();
	// Experimental WebRTC low-latency playback, opt-in and only offered when the
	// operator has enabled WebRTC server-side. Off by default so the standard
	// HLS experience is unchanged.
	const [lowLatencyMode, setLowLatencyMode] = useState(false);
	const webRTCAvailable = !!serverStatus.protocol?.webrtcEnabled;
	// The store keeps chat messages as ChatMessage | SocketEvent; the previous
	// Recoil compatibility layer performed the same cast internally.
	const messages = useChatMessages() as ChatMessage[];
	const online = useIsOnline();
	const isChatAvailable = useIsChatAvailable();
	const chatAuthenticated = useChatAuthenticated();

	const { viewerCount, lastConnectTime, lastDisconnectTime, streamTitle } = useServerStatus();
	const {
		extraPageContent,
		name,
		summary,
		socialHandles,
		tags,
		externalActions,
		offlineMessage,
		offlineMediaUrl,
		offlineMediaType,
		streamSchedule,
		chatDisabled,
		federation,
		notifications,
	} = clientConfig;
	const twitterProfileUrl =
		socialHandles?.find(h => (h?.platform || '').toLowerCase() === 'twitter')?.url || null;
	const [showNotifyReminder, setShowNotifyReminder] = useState(false);
	const [showNotifyModal, setShowNotifyModal] = useState(false);
	const [showFollowModal, setShowFollowModal] = useState(false);
	const { account: fediverseAccount, enabled: fediverseEnabled } = federation;
	const { browser: browserNotifications } = notifications;
	const { enabled: browserNotificationsEnabled } = browserNotifications;
	const { online: isStreamLive } = serverStatus;
	// When social auth is required, the server denies HLS/WebRTC to
	// unauthenticated viewers, so mounting a player would only surface a
	// cryptic manifest parse error in the console. Keep the placeholder up
	// instead; Main.tsx overlays the forced login modal in this state.
	const auth = clientConfig.authentication;
	const playbackBlocked =
		!!auth?.requireTwitterAuth &&
		(auth.xAuthEnabled ||
			auth.discordAuthEnabled ||
			auth.twitterAuthEnabled ||
			auth.googleAuthEnabled ||
			auth.githubAuthEnabled) &&
		!chatAuthenticated;
	const [externalActionToDisplay, setExternalActionToDisplay] = useState<ExternalAction>(null);

	const [supportsBrowserNotifications, setSupportsBrowserNotifications] = useState(false);
	const supportFediverseFeatures = fediverseEnabled;

	const [showChatModal, setShowChatModal] = useState(false);

	const externalActionSelected = (action: ExternalAction) => {
		const { openExternally, url } = action;
		// apply openExternally only if we don't have an HTML embed
		if (openExternally && url) {
			window.open(url, '_blank');
		} else {
			setExternalActionToDisplay(action);
		}
	};

	const incrementVisitCounter = () => {
		let visits = parseInt(getLocalStorage(LOCAL_STORAGE_KEYS.userVisitCount), 10);
		if (Number.isNaN(visits)) {
			visits = 0;
		}

		setLocalStorage(LOCAL_STORAGE_KEYS.userVisitCount, visits + 1);

		if (visits > 2 && !getLocalStorage(LOCAL_STORAGE_KEYS.hasDisplayedNotificationModal)) {
			setShowNotifyReminder(true);
		}
	};

	const disableNotifyReminderPopup = () => {
		setShowNotifyModal(false);
		setShowNotifyReminder(false);
		setLocalStorage(LOCAL_STORAGE_KEYS.hasDisplayedNotificationModal, true);
	};

	// The docked chat column needs real horizontal room: below 1024px it
	// squeezed the player/content to half width on tablets, so mid-size
	// screens use the floating chat button + modal instead. isMobile (<768)
	// keeps driving the content layout (tabs vs sections) as before.
	const isNarrow = useMediaQuery('(max-width: 1023.98px)');
	// Keep the store's isMobile in sync with the shared breakpoint (mirrors
	// styles/mixins.scss screen(tablet)).
	const isMobileViewport = useMediaQuery('(max-width: 767.98px)');
	useEffect(() => {
		setIsMobile(isMobileViewport);
	}, [isMobileViewport]);

	useEffect(() => {
		incrementVisitCounter();
	}, []);

	useEffect(() => {
		// isPushNotificationSupported relies on `navigator` so that needs to be
		// fired from this useEffect.
		setSupportsBrowserNotifications(isPushNotificationSupported() && browserNotificationsEnabled);
	}, [browserNotificationsEnabled]);

	// Moderators keep an offline waiting chat; regular viewers only get chat
	// while the stream is live.
	// Note: the store's CurrentUser only carries the precomputed isModerator
	// flag (derived from scopes in connected-client-info-handler); it has no
	// scopes property, so the previous scopes check never matched.
	const isModerator = !!currentUser?.isModerator;
	const showChat = (isChatAvailable || isModerator) && !chatDisabled && isChatVisible;
	const chatDocked = showChat && !isNarrow;

	// Expose the docked-chat state to layout chrome outside this component:
	// the footer spans the full page width and its right-aligned links were
	// hidden behind the fixed chat column without this.
	useEffect(() => {
		document.documentElement.setAttribute('data-chat-docked', chatDocked ? 'true' : 'false');
		return () => {
			document.documentElement.removeAttribute('data-chat-docked');
		};
	}, [chatDocked]);

	const actionButtons = (
		<ActionButtons
			supportFediverseFeatures={supportFediverseFeatures}
			supportsBrowserNotifications={supportsBrowserNotifications}
			showNotifyReminder={showNotifyReminder}
			setShowNotifyModal={setShowNotifyModal}
			disableNotifyReminderPopup={disableNotifyReminderPopup}
			externalActions={externalActions}
			setExternalActionToDisplay={setExternalActionToDisplay}
			setShowFollowModal={setShowFollowModal}
			externalActionSelected={externalActionSelected}
		/>
	);

	return (
		<>
			{chatDocked && <Sidebar />}
			<main
				className={classnames(styles.contentShell, chatDocked && styles.withChat)}
			>
				<div className={styles.contentColumn}>
					{(appState.appLoading || (online && playbackBlocked)) && (
						<div className={styles.playerPlaceholder} />
					)}
					{online && !playbackBlocked && (
						<section className={styles.playerContainer}>
							{lowLatencyMode && webRTCAvailable ? (
								<WebRTCPlayer
									serverUrl=""
									online={online}
									className={styles.topSectionElement}
									onConnectionStateChange={state => {
										// Fall back to HLS if WebRTC cannot connect on this
										// network (e.g. no working ICE path).
										if (state === 'failed') {
											setLowLatencyMode(false);
										}
									}}
								/>
							) : (
								<OwncastPlayer
									// When delivery is delegated to an external managed service
									// (AWS IVS / IVS-compatible), play its HLS URL directly;
									// otherwise the self-hosted playlist. In external mode the
									// status reports webrtcEnabled=false, so the WebRTC branch and
									// its toggle are already skipped.
									source={serverStatus.externalStreamUrl || '/hls/stream.m3u8'}
									online={online}
									title={streamTitle || name}
									className={styles.topSectionElement}
									protocol={serverStatus.protocol}
								/>
							)}
							{/* Overlaid on the top-right of the video so the mode switch is
							    always visible with the player, not buried below it. */}
							{webRTCAvailable && (
								<div className={styles.lowLatencyToggle}>
									<Button
										size="small"
										type={lowLatencyMode ? 'primary' : 'default'}
										onClick={() => setLowLatencyMode(v => !v)}
									>
										{lowLatencyMode
											? t('video.lowLatencyToggle.disable')
											: t('video.lowLatencyToggle.enable')}
									</Button>
								</div>
							)}
						</section>
					)}
					{!online && !appState.appLoading && (
						<section id="offline-message">
							<OfflineBanner
								showsHeader={false}
								streamName={name}
								customText={offlineMessage}
								notificationsEnabled={supportsBrowserNotifications}
								fediverseAccount={fediverseAccount}
								twitterProfileUrl={twitterProfileUrl}
								offlineMediaUrl={offlineMediaUrl}
								offlineMediaType={offlineMediaType}
								lastLive={lastDisconnectTime}
								onNotifyClick={() => setShowNotifyModal(true)}
								onFollowClick={() => setShowFollowModal(true)}
								className={classnames([styles.topSectionElement, styles.offlineBanner])}
							/>
							{streamSchedule && (
								<div className={styles.schedule}>
									<span className={styles.scheduleLabel}>{t('schedule.next')}</span>
									<span className={styles.scheduleText}>{streamSchedule}</span>
								</div>
							)}
						</section>
					)}
					{isStreamLive && (
						<Statusbar
							online={online}
							lastConnectTime={lastConnectTime}
							lastDisconnectTime={lastDisconnectTime}
							viewerCount={viewerCount}
							className={classnames(styles.topSectionElement, styles.statusBar)}
						/>
					)}
					{/* Desktop: identity row (name, summary, tags, social links) with the
					    action buttons inline; mobile keeps the header inside its About tab
					    and the actions as their own strip. */}
					{!isMobile && (
						<ContentHeader
							name={name}
							summary={summary}
							tags={tags}
							links={socialHandles}
							logo="/logo"
							actions={actionButtons}
						/>
					)}
					<ArchivesRow />
					{isMobile ? (
						<>
							{actionButtons}
							<MobileContent
								name={name}
								summary={summary}
								tags={tags}
								socialHandles={socialHandles}
								extraPageContent={extraPageContent}
								setShowFollowModal={setShowFollowModal}
								supportFediverseFeatures={supportFediverseFeatures}
							/>
						</>
					) : (
						<DesktopContent
							name={name}
							extraPageContent={extraPageContent}
							setShowFollowModal={setShowFollowModal}
							supportFediverseFeatures={supportFediverseFeatures}
						/>
					)}
				</div>
			</main>

			<Modal
				title={t('ui.modals.browserNotifications')}
				open={showNotifyModal}
				afterClose={() => disableNotifyReminderPopup()}
				handleCancel={() => disableNotifyReminderPopup()}
			>
				<BrowserNotifyModal />
			</Modal>
			{externalActionToDisplay && (
				<ExternalModal
					externalActionToDisplay={externalActionToDisplay}
					setExternalActionToDisplay={setExternalActionToDisplay}
				/>
			)}
			<Modal
				title={t('ui.modals.followName', { name })}
				open={showFollowModal}
				handleCancel={() => setShowFollowModal(false)}
				width="550px"
			>
				<FollowModal
					account={fediverseAccount}
					name={name}
					handleClose={() => setShowFollowModal(false)}
				/>
			</Modal>
			{isNarrow && showChatModal && isChatVisible && (
				<ChatModal
					messages={messages}
					currentUser={currentUser}
					handleClose={() => setShowChatModal(false)}
				/>
			)}
			{isNarrow && isChatAvailable && (
				<Button
					id="mobile-chat-button"
					type="primary"
					onClick={() => setShowChatModal(true)}
					className={styles.floatingMobileChatModalButton}
				>
					{t('chat.openChat')} <MessageFilled />
				</Button>
			)}
		</>
	);
};
