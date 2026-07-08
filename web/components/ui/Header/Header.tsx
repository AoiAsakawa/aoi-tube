import { Avatar, Dropdown } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../../utils/use-media-query';
import cn from 'classnames';
import dynamic from '@components/compat/dynamic';
import Link from '@components/compat/Link';
import styles from './Header.module.scss';
import { SUPPORTED_LANGUAGES } from '../../../i18n';
import { useSiteTheme } from '../../../utils/useSiteTheme';
import { useServerStatus } from '../../stores/zustand-store';

// Lazy loaded components

const UserDropdown = dynamic(
	() => import('../../common/UserDropdown/UserDropdown').then(mod => mod.UserDropdown),
	{
		ssr: false,
	},
);

const GlobalOutlined = dynamic(() => import('@ant-design/icons/GlobalOutlined'), {
	ssr: false,
});

const SunOutlined = dynamic(() => import('@ant-design/icons/SunOutlined'), {
	ssr: false,
});

const MoonOutlined = dynamic(() => import('@ant-design/icons/MoonOutlined'), {
	ssr: false,
});

const LoginOutlined = dynamic(() => import('@ant-design/icons/LoginOutlined'), {
	ssr: false,
});

export type HeaderComponentProps = {
	name: string;
	chatAvailable: boolean;
	chatDisabled: boolean;
	online: boolean;
	// Offline login entry point: shown when social auth is required but the
	// viewer has not authenticated yet.
	showLoginButton?: boolean;
	onLoginClick?: () => void;
	// Pages without a chat panel (archives, docs) keep the user menu but hide
	// its show/hide-chat item.
	showChatToggle?: boolean;
};

export const Header: FC<HeaderComponentProps> = ({
	name,
	chatDisabled,
	online,
	showLoginButton = false,
	onLoginClick,
	showChatToggle = true,
}) => {
	const { t, i18n } = useTranslation();
	// Matches the docked chat column breakpoint in Content.tsx: the
	// show/hide-chat menu item only makes sense when the column exists.
	const canHideChat = useMediaQuery('(min-width: 1024px)');

	const currentLanguage = SUPPORTED_LANGUAGES.some(l => l.code === i18n.language)
		? i18n.language
		: 'en';

	const { theme, toggleTheme } = useSiteTheme();
	// Silent (test) broadcasts show a TEST badge instead of LIVE.
	const { silentMode } = useServerStatus();

	return (
		<header className={cn([`${styles.header}`], 'global-header')}>
			{online ? (
				<Link href="#player" className={styles.skipLink}>
					{t('ui.header.skipToPlayer')}
				</Link>
			) : (
				<Link href="#offline-message" className={styles.skipLink}>
					{t('ui.header.skipToOfflineMessage')}
				</Link>
			)}
			<Link href="#skip-to-content" className={styles.skipLink}>
				{t('ui.header.skipToContent')}
			</Link>
			<Link href="#footer" className={styles.skipLink}>
				{t('ui.header.skipToFooter')}
			</Link>
			<div className={styles.logo}>
				<Link href="/" className={styles.logoLink} aria-label={t('ui.header.home')}>
					<div id="header-logo" className={styles.logoImage}>
						<Avatar src="/logo" size="large" shape="circle" className={styles.avatar} />
					</div>
					<span className={styles.title} id="global-header-text">
						{name}
					</span>
				</Link>
				{online && (
					<span className={cn(styles.liveBadge, silentMode && styles.testBadge)}>
						{silentMode ? 'TEST' : 'LIVE'}
					</span>
				)}
			</div>
			<div className={styles.rightSection}>
				<button
					type="button"
					className={styles.languageButton}
					onClick={toggleTheme}
					aria-label={t('ui.header.toggleTheme')}
				>
					{theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
				</button>
				<Dropdown
					menu={{
						items: SUPPORTED_LANGUAGES.map(l => ({ key: l.code, label: l.label })),
						selectable: true,
						selectedKeys: [currentLanguage],
						onClick: ({ key }) => i18n.changeLanguage(key),
					}}
					trigger={['click']}
					placement="bottomRight"
					overlayClassName="language-dropdown-dark"
				>
					<button type="button" className={styles.languageButton} aria-label={t('ui.header.language')}>
						<GlobalOutlined />
					</button>
				</Dropdown>
				{showLoginButton ? (
					// Unauthenticated visitors get a single login entry point in
					// place of the user menu; the menu appears once authenticated.
					<button type="button" className={styles.loginButton} onClick={onLoginClick}>
						<LoginOutlined /> {t('ui.header.login')}
					</button>
				) : (
					!chatDisabled && (
						<UserDropdown
							id="user-menu"
							hideTitleOnMobile
							showToggleChatOption={canHideChat && showChatToggle}
						/>
					)
				)}
			</div>
		</header>
	);
};
export default Header;
