import React, { FC, ReactNode, useContext, useEffect, useState } from 'react';
import Link from '@components/compat/Link';
import Head from '@components/compat/Head';
import { differenceInSeconds } from 'date-fns';
import { useRouter } from '@components/compat/router';
import { Layout, Menu, Alert, Button, Dropdown, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

import classNames from 'classnames';
import dynamic from '@components/compat/dynamic';
import { parseSecondsToDurationString } from '../../utils/format';

import { ServerStatusContext } from '../../utils/server-status-context';
import { AlertMessageContext } from '../../utils/alert-message-context';

import { TextFieldWithSubmit } from './TextFieldWithSubmit';
import { TEXTFIELD_PROPS_STREAM_TITLE } from '../../utils/config-constants';
import { ComposeFederatedPost } from './ComposeFederatedPost';
import { UpdateArgs } from '../../types/config-section';
import { FatalErrorStateModal } from '../modals/FatalErrorStateModal/FatalErrorStateModal';
import { useSiteTheme } from '../../utils/useSiteTheme';
import { SUPPORTED_LANGUAGES } from '../../i18n';

// Lazy loaded components

const SettingOutlined = dynamic(() => import('@ant-design/icons/SettingOutlined'), {
	ssr: false,
}); // Lazy loaded components

const SunToggleIcon = dynamic(() => import('@ant-design/icons/SunOutlined'), {
	ssr: false,
});

const MoonToggleIcon = dynamic(() => import('@ant-design/icons/MoonOutlined'), {
	ssr: false,
});

const GlobalOutlined = dynamic(() => import('@ant-design/icons/GlobalOutlined'), {
	ssr: false,
});

const HomeOutlined = dynamic(() => import('@ant-design/icons/HomeOutlined'), {
	ssr: false,
});

const ToolOutlined = dynamic(() => import('@ant-design/icons/ToolOutlined'), {
	ssr: false,
});

const PlayCircleFilled = dynamic(() => import('@ant-design/icons/PlayCircleFilled'), {
	ssr: false,
});

const MinusSquareFilled = dynamic(() => import('@ant-design/icons/MinusSquareFilled'), {
	ssr: false,
});

const QuestionCircleOutlined = dynamic(() => import('@ant-design/icons/QuestionCircleOutlined'), {
	ssr: false,
});

const LogoutOutlined = dynamic(() => import('@ant-design/icons/LogoutOutlined'), {
	ssr: false,
});

const MessageOutlined = dynamic(() => import('@ant-design/icons/MessageOutlined'), {
	ssr: false,
});

const VideoCameraOutlined = dynamic(() => import('@ant-design/icons/VideoCameraOutlined'), {
	ssr: false,
});

const ApiOutlined = dynamic(() => import('@ant-design/icons/ApiOutlined'), {
	ssr: false,
});

const EyeOutlined = dynamic(() => import('@ant-design/icons/EyeOutlined'), {
	ssr: false,
});

const GiftOutlined = dynamic(() => import('@ant-design/icons/GiftOutlined'), {
	ssr: false,
});

const EditOutlined = dynamic(() => import('@ant-design/icons/EditOutlined'), {
	ssr: false,
});

export type MainLayoutProps = {
	children: ReactNode;
};

export const MainLayout: FC<MainLayoutProps> = ({ children }) => {
	const context = useContext(ServerStatusContext);
	const { serverConfig, online, broadcaster, versionNumber, error: serverError } = context || {};
	const { instanceDetails, chatDisabled, federation } = serverConfig;
	const { enabled: federationEnabled } = federation;

	const [currentStreamTitle, setCurrentStreamTitle] = useState('');
	const [postModalDisplayed, setPostModalDisplayed] = useState(false);

	const alertMessage = useContext(AlertMessageContext);
	const { theme: siteTheme, toggleTheme } = useSiteTheme();
	const { t, i18n } = useTranslation();

	// Follow the viewer-side header: fall back to English when the detected
	// language is not one of the supported ones.
	const currentLanguage = SUPPORTED_LANGUAGES.some(l => l.code === i18n.language)
		? i18n.language
		: 'en';

	const router = useRouter();
	const { route } = router || {};

	const { Header, Footer, Content, Sider } = Layout;

	useEffect(() => {
		setCurrentStreamTitle(instanceDetails.streamTitle);
	}, [instanceDetails]);

	const handleStreamTitleChanged = ({ value }: UpdateArgs) => {
		setCurrentStreamTitle(value);
	};

	const handleCreatePostButtonPressed = () => {
		setPostModalDisplayed(true);
	};

	const appClass = classNames({
		'app-container': true,
		online,
	});

	const openMenuItems = [];

	const clearAlertMessage = () => {
		alertMessage.setMessage(null);
	};

	const headerAlertMessage = alertMessage.message ? (
		<Alert message={alertMessage.message} afterClose={clearAlertMessage} banner closable />
	) : null;

	// status indicator items
	const streamDurationString = broadcaster
		? parseSecondsToDurationString(differenceInSeconds(new Date(), new Date(broadcaster.time)))
		: '';

	const statusIcon = online ? <PlayCircleFilled /> : <MinusSquareFilled />;
	const statusMessage = online
		? t('admin.layout.mainLayout.statusOnline', { duration: streamDurationString })
		: t('admin.layout.mainLayout.statusOffline');

	const statusIndicator = (
		<div className="online-status-indicator">
			<span className="status-label">{statusMessage}</span>
			<span className="status-icon">{statusIcon}</span>
		</div>
	);

	// Fediverse lives as a labelled group inside Integrations & API (it is a
	// rarely-used integration, not a daily destination). The follower/action
	// pages appear once federation is enabled; the settings page is always
	// reachable so the feature can be turned on at all.
	const integrationsMenu = [
		{
			label: <Link href="/admin/webhooks">Webhook</Link>,
			key: '/admin/webhooks',
		},
		{
			label: <Link href="/admin/access-tokens">{t('admin.layout.mainLayout.menu.accessTokens')}</Link>,
			key: '/admin/access-tokens',
		},
		{
			label: <Link href="/admin/actions">{t('admin.layout.mainLayout.menu.externalActions')}</Link>,
			key: '/admin/actions',
		},
		{
			type: 'group' as const,
			key: 'integrations-group-fediverse',
			label: t('admin.layout.mainLayout.menu.fediverse'),
			children: [
				federationEnabled && {
					label: (
						<Link href="/admin/federation/followers">
							{t('admin.layout.mainLayout.menu.followers')}
						</Link>
					),
					key: '/admin/federation/followers',
				},
				federationEnabled && {
					label: (
						<Link href="/admin/federation/actions">
							{t('admin.layout.mainLayout.menu.socialActions')}
						</Link>
					),
					key: '/admin/federation/actions',
				},
				{
					label: (
						<Link href="/admin/config-federation">
							{t('admin.layout.mainLayout.menu.federationSettings')}
						</Link>
					),
					key: '/admin/config-federation',
				},
			].filter(Boolean),
		},
	];

	// The super chat submenu is split into labelled groups for wayfinding.
	// Item keys/paths are unchanged; only the grouping is presentational.
	const donationsMenu = [
		{
			type: 'group' as const,
			key: 'donations-group-management',
			label: t('admin.layout.mainLayout.menuGroups.management'),
			children: [
				{
					label: (
						<Link href="/admin/donations">{t('admin.layout.mainLayout.menu.donationsAdmin')}</Link>
					),
					key: '/admin/donations',
				},
				{
					label: (
						<Link href="/admin/config-coins">{t('admin.layout.mainLayout.menu.coinsSettings')}</Link>
					),
					key: '/admin/config-coins',
				},
			],
		},
		{
			type: 'group' as const,
			key: 'donations-group-providers',
			label: t('admin.layout.mainLayout.menuGroups.providers'),
			children: [
				{
					label: (
						<Link href="/admin/config-paypay">
							{t('admin.layout.mainLayout.menu.paypaySettings')}
						</Link>
					),
					key: '/admin/config-paypay',
				},
				{
					label: (
						<Link href="/admin/config-paypal">
							{t('admin.layout.mainLayout.menu.paypalSettings')}
						</Link>
					),
					key: '/admin/config-paypal',
				},
				{
					label: (
						<Link href="/admin/config-stripe">
							{t('admin.layout.mainLayout.menu.stripeSettings')}
						</Link>
					),
					key: '/admin/config-stripe',
				},
				{
					label: (
						<Link href="/admin/config-metamask">
							{t('admin.layout.mainLayout.menu.metamaskSettings')}
						</Link>
					),
					key: '/admin/config-metamask',
				},
				{
					label: (
						<Link href="/admin/config-kofi">{t('admin.layout.mainLayout.menu.kofiSettings')}</Link>
					),
					key: '/admin/config-kofi',
				},
				{
					label: (
						<Link href="/admin/config-doneru">
							{t('admin.layout.mainLayout.menu.doneruSettings')}
						</Link>
					),
					key: '/admin/config-doneru',
				},
			],
		},
		{
			type: 'group' as const,
			key: 'donations-group-legal',
			label: t('admin.layout.mainLayout.menuGroups.legal'),
			children: [
				{
					label: (
						<Link href="/admin/config-tokushoho">{t('admin.layout.mainLayout.menu.tokushoho')}</Link>
					),
					key: '/admin/config-tokushoho',
				},
				{
					label: (
						<Link href="/admin/config-faq">{t('admin.layout.mainLayout.menu.faqSettings')}</Link>
					),
					key: '/admin/config-faq',
				},
			],
		},
	];

	// Broadcast operations: live status, recorded content and the video /
	// stream-protocol / recording settings that drive them.
	const broadcastMenu = [
		{
			label: (
				<Link href="/admin/stream-health">{t('admin.layout.mainLayout.menu.streamHealth')}</Link>
			),
			key: '/admin/stream-health',
		},
		{
			label: <Link href="/admin/archives">{t('admin.layout.mainLayout.menu.archives')}</Link>,
			key: '/admin/archives',
		},
		{
			label: (
				<Link href="/admin/config-video">{t('admin.layout.mainLayout.menu.videoSettings')}</Link>
			),
			key: '/admin/config-video',
		},
	];

	// Audience: stats, chat moderation, account governance and chat settings.
	// When chat is disabled only the stats page and the chat settings (the
	// place to turn chat back on) remain.
	const chatMenu = [
		{
			label: <Link href="/admin/viewer-info">{t('admin.layout.mainLayout.menu.viewers')}</Link>,
			key: '/admin/viewer-info',
		},
		!chatDisabled && {
			label: <Link href="/admin/chat">{t('admin.layout.mainLayout.menu.chatManagement')}</Link>,
			key: '/admin/chat',
		},
		!chatDisabled && {
			label: (
				<Link href="/admin/chat/user-data">{t('admin.layout.mainLayout.menu.userData')}</Link>
			),
			key: '/admin/chat/user-data',
		},
		!chatDisabled && {
			label: <Link href="/admin/chat/emojis">{t('admin.layout.mainLayout.menu.emojis')}</Link>,
			key: '/admin/chat/emojis',
		},
		{
			label: <Link href="/admin/config-chat">{t('admin.layout.mainLayout.menu.chatSettings')}</Link>,
			key: '/admin/config-chat',
		},
	].filter(Boolean);

	// Diagnostics only — content management lives under Broadcast.
	const utilitiesMenu = [
		{
			label: <Link href="/admin/hardware-info">{t('admin.layout.mainLayout.menu.hardware')}</Link>,
			key: '/admin/hardware-info',
		},
		{
			label: <Link href="/admin/logs">{t('admin.layout.mainLayout.menu.logs')}</Link>,
			key: '/admin/logs',
		},
	];

	const configurationMenu = [
		{
			label: (
				<Link href="/admin/config/general">
					{t('admin.layout.mainLayout.menu.generalSettings')}
				</Link>
			),
			key: '/admin/config/general',
		},
		{
			label: (
				<Link href="/admin/config/server">{t('admin.layout.mainLayout.menu.serverSettings')}</Link>
			),
			key: '/admin/config/server',
		},
		{
			label: (
				<Link href="/admin/config-social-items">
					{t('admin.layout.mainLayout.menu.socialSettings')}
				</Link>
			),
			key: '/admin/config-social-items',
		},
		{
			label: (
				<Link href="/admin/config-notify">
					{t('admin.layout.mainLayout.menu.notificationSettings')}
				</Link>
			),
			key: '/admin/config-notify',
		},
		{
			// Authelia settings embedded in the admin UI (password/passkeys/keys/TOTP)
			label: (
				<Link href="/admin/login-settings">{t('admin.layout.mainLayout.menu.loginSettings')}</Link>
			),
			key: '/admin/login-settings',
		},
	];

	// Ordered by operator workflow: dashboard → daily broadcast work →
	// audience → revenue → federation → settings → developer/diagnostics.
	const menuItems = [
		{
			label: <Link href="/admin">{t('admin.layout.mainLayout.menu.home')}</Link>,
			icon: <HomeOutlined />,
			key: '/admin',
		},
		{
			key: 'broadcast',
			label: t('admin.layout.mainLayout.menu.broadcast'),
			icon: <VideoCameraOutlined />,
			children: broadcastMenu,
		},
		{
			label: <span>{t('admin.layout.mainLayout.menu.chatAndUsers')}</span>,
			icon: <MessageOutlined />,
			children: chatMenu,
			key: 'chat-and-users',
		},
		{
			key: 'donations',
			label: t('admin.layout.mainLayout.menu.donations'),
			icon: <GiftOutlined />,
			children: donationsMenu,
		},
		{
			key: 'configuration',
			label: t('admin.layout.mainLayout.menu.configuration'),
			icon: <SettingOutlined />,
			children: configurationMenu,
		},
		{
			key: 'integrations',
			label: t('admin.layout.mainLayout.menu.integrations'),
			icon: <ApiOutlined />,
			children: integrationsMenu,
		},
		{
			key: 'utilities',
			label: t('admin.layout.mainLayout.menu.utilities'),
			icon: <ToolOutlined />,
			children: utilitiesMenu,
		},
		{
			key: '/admin/help',
			label: <Link href="/admin/help">{t('admin.layout.mainLayout.menu.help')}</Link>,
			icon: <QuestionCircleOutlined />,
		},
		{
			key: 'logout',
			// Destroys the Authelia session (Basic auth is injected by Nginx,
			// so logging out of Authelia is the effective logout)
			label: <a href="/authelia/logout">{t('admin.layout.mainLayout.menu.logout')}</a>,
			icon: <LogoutOutlined />,
		},
	];

	const [openKeys, setOpenKeys] = useState(openMenuItems);

	const onOpenChange = (keys: string[]) => {
		setOpenKeys(keys);
	};

	useEffect(() => {
		// Open the submenu that owns the current route. Menu group entries
		// (e.g. the super chat sections) nest their items one level deeper
		// than plain entries, so look through both levels.
		menuItems.forEach(item =>
			item?.children?.forEach(child => {
				if (child?.key === route) setOpenKeys([...openMenuItems, item.key]);
				child?.children?.forEach(grandchild => {
					if (grandchild?.key === route) setOpenKeys([...openMenuItems, item.key]);
				});
			}),
		);
	}, []);

	return (
		<Layout id="admin-page" className={appClass}>
			<Head>
				<title>
					{t('admin.layout.mainLayout.pageTitle', { name: instanceDetails?.name || 'AoiTube' })}
				</title>
				<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon/favicon-32x32.png" />
			</Head>

			{serverError?.type === 'OWNCAST_SERVICE_UNREACHABLE' && (
				<FatalErrorStateModal
					title={t('admin.layout.mainLayout.serverUnreachable')}
					message={serverError.msg}
				/>
			)}

			{/* Collapses off-canvas below the lg breakpoint: without this the
			    fixed 240px rail crushed phone-width admin pages into an
			    unusable ~130px column. The zero-width trigger renders antd's
			    floating handle so the menu stays reachable when collapsed. */}
			<Sider
				width={240}
				className="side-nav"
				theme="dark"
				breakpoint="lg"
				collapsedWidth={0}
				// Sits below the fixed header and above every page surface —
				// at the default position the header intercepted its clicks.
				zeroWidthTriggerStyle={{ top: 76, zIndex: 1100 }}
			>
				{/* Demoted from h1 so each admin view has exactly one h1: the
				    page content's AdminPageHeader. */}
				<span className="owncast-title">
					<span className="logo-container">
						{/* The operator-configured site logo, matching the viewer header. */}
						<img src="/logo" alt="" />
					</span>
					<span className="title-label">
						{t('admin.layout.mainLayout.adminDashboardTitle', {
							name: instanceDetails?.name || 'AoiTube',
						})}
					</span>
				</span>
				<Menu
					theme="dark"
					mode="inline"
					className="menu-container"
					items={menuItems}
					selectedKeys={[route || '/admin']}
					openKeys={openKeys}
					onOpenChange={onOpenChange}
				/>
			</Sider>

			<Layout className="layout-main">
				<Header className="layout-header">
					<Space direction="horizontal">
						{/* Quick jump to the viewer-facing site in a new tab. */}
						<Button
							type="text"
							size="small"
							icon={<EyeOutlined />}
							href="/"
							target="_blank"
							rel="noopener noreferrer"
						>
							{t('admin.layout.mainLayout.viewSite')}
						</Button>
						{federationEnabled && (
							<Tooltip title={t('admin.layout.mainLayout.composePostTooltip')}>
								<Button
									type="link"
									icon={<EditOutlined />}
									size="small"
									onClick={handleCreatePostButtonPressed}
								>
									{t('admin.layout.mainLayout.composePost')}
								</Button>
							</Tooltip>
						)}
					</Space>
					<div className="global-stream-title-container">
						<TextFieldWithSubmit
							fieldName="streamTitle"
							{...TEXTFIELD_PROPS_STREAM_TITLE}
							placeholder={t('admin.layout.mainLayout.streamTitlePlaceholder')}
							value={currentStreamTitle}
							initialValue={instanceDetails.streamTitle}
							onChange={handleStreamTitleChanged}
						/>
					</div>
					<Space direction="horizontal">
						<Tooltip
							title={
								siteTheme === 'dark'
									? t('admin.layout.mainLayout.switchToLight')
									: t('admin.layout.mainLayout.switchToDark')
							}
						>
							<Button
								type="text"
								size="small"
								aria-label={t('admin.layout.mainLayout.themeToggle')}
								onClick={toggleTheme}
								icon={siteTheme === 'dark' ? <SunToggleIcon /> : <MoonToggleIcon />}
							/>
						</Tooltip>
						<Dropdown
							menu={{
								items: SUPPORTED_LANGUAGES.map(l => ({ key: l.code, label: l.label })),
								selectable: true,
								selectedKeys: [currentLanguage],
								// The language detector caches the choice in
								// localStorage ('owncastLanguage'), shared with the viewer UI.
								onClick: ({ key }) => i18n.changeLanguage(key),
							}}
							trigger={['click']}
							placement="bottomRight"
						>
							<Button
								type="text"
								size="small"
								aria-label={t('admin.layout.mainLayout.language')}
								icon={<GlobalOutlined />}
							/>
						</Dropdown>
						{statusIndicator}
					</Space>
				</Header>

				{headerAlertMessage}

				<Content className="main-content-container">{children}</Content>

				<Footer className="footer-container">
					<a href="https://owncast.online/?source=admin" target="_blank" rel="noopener noreferrer">
						{t('admin.layout.mainLayout.aboutAoiTube', { version: versionNumber })}
					</a>
				</Footer>
			</Layout>

			<ComposeFederatedPost
				open={postModalDisplayed}
				handleClose={() => setPostModalDisplayed(false)}
			/>
		</Layout>
	);
};
