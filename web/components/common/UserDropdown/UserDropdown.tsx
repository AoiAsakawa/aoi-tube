import { Dropdown, Button } from 'antd';
import classnames from 'classnames';

import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from 'react-hotkeys-hook';
import dynamic from '@components/compat/dynamic';
import { ErrorBoundary } from 'react-error-boundary';
import {
	useChatVisibleToggle,
	useSetChatVisibleToggle,
	useChatAuthenticated,
	useCurrentUser,
	useAppState,
} from '../../stores/zustand-store';
import styles from './UserDropdown.module.scss';
import { ComponentError } from '../../ui/ComponentError/ComponentError';

// Lazy loaded components

const CaretDownOutlined = dynamic(() => import('@ant-design/icons/CaretDownOutlined'), {
	ssr: false,
});

const EditOutlined = dynamic(() => import('@ant-design/icons/EditOutlined'), {
	ssr: false,
});

const LockOutlined = dynamic(() => import('@ant-design/icons/LockOutlined'), {
	ssr: false,
});

const HistoryOutlined = dynamic(() => import('@ant-design/icons/HistoryOutlined'), {
	ssr: false,
});

const MessageOutlined = dynamic(() => import('@ant-design/icons/MessageOutlined'), {
	ssr: false,
});

const LogoutOutlined = dynamic(() => import('@ant-design/icons/LogoutOutlined'), {
	ssr: false,
});

const UserOutlined = dynamic(() => import('@ant-design/icons/UserOutlined'), {
	ssr: false,
});

const Modal = dynamic(() => import('../../ui/Modal/Modal').then(mod => mod.Modal), {
	ssr: false,
});

const NameChangeModal = dynamic(
	() => import('../../modals/NameChangeModal/NameChangeModal').then(mod => mod.NameChangeModal),
	{
		ssr: false,
	},
);

const AuthModal = dynamic(
	() => import('../../modals/AuthModal/AuthModal').then(mod => mod.AuthModal),
	{
		ssr: false,
	},
);

const PurchaseHistoryModal = dynamic(
	() =>
		import('../../modals/PurchaseHistoryModal/PurchaseHistoryModal').then(
			mod => mod.PurchaseHistoryModal,
		),
	{
		ssr: false,
	},
);

export type UserDropdownProps = {
	id: string;
	username?: string;
	hideTitleOnMobile?: boolean;
	showToggleChatOption?: boolean;
};

export const UserDropdown: FC<UserDropdownProps> = ({
	id,
	username: defaultUsername = undefined,
	hideTitleOnMobile = false,
	showToggleChatOption: showHideChatOption = true,
}) => {
	const { t } = useTranslation();
	const [showNameChangeModal, setShowNameChangeModal] = useState<boolean>(false);
	const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
	const [showPurchasesModal, setShowPurchasesModal] = useState<boolean>(false);
	const chatToggleVisible = useChatVisibleToggle();
	const setChatToggleVisible = useSetChatVisibleToggle();
	const appState = useAppState();

	const toggleChatVisibility = () => {
		// If we don't support the hide chat option then don't do anything.
		if (!showHideChatOption) {
			return;
		}

		setChatToggleVisible(!chatToggleVisible);
	};

	const handleChangeName = () => {
		setShowNameChangeModal(true);
	};

	// Register keyboard shortcut for the space bar to toggle playback
	useHotkeys(
		'c',
		toggleChatVisibility,
		{
			enableOnContentEditable: false,
		},
		[chatToggleVisible],
	);

	const currentUser = useCurrentUser();
	const chatAuthenticated = useChatAuthenticated();
	if (!currentUser) {
		return null;
	}

	const { displayName } = currentUser;
	const rawUsername = defaultUsername || displayName;
	// Guest-explicit identity: an unauthenticated viewer has an auto-assigned
	// name, so label it as a guest rather than presenting it like a real
	// account. Logging in (the "auth" menu item) upgrades it to a persistent
	// account that also carries paid-archive purchases across devices.
	const username = chatAuthenticated
		? rawUsername
		: t('ui.userMenu.guestName', { name: rawUsername });

	// Logging out drops the local chat identity: the access token is removed
	// and a fresh anonymous user is registered on reload.
	const handleLogout = () => {
		window.localStorage.removeItem('accessToken');
		window.location.reload();
	};

	const menuItems = [
		{
			key: '0',
			icon: <EditOutlined />,
			label: t('ui.userMenu.changeName'),
			onClick: () => handleChangeName(),
		},
		{
			key: '1',
			icon: <LockOutlined />,
			label: t('ui.userMenu.auth'),
			onClick: () => setShowAuthModal(true),
		},
		{
			key: 'purchases',
			icon: <HistoryOutlined />,
			label: t('ui.userMenu.purchases'),
			onClick: () => setShowPurchasesModal(true),
		},
		...(showHideChatOption && appState.chatAvailable
			? [
					{
						key: '3',
						icon: <MessageOutlined />,
						label: chatToggleVisible ? t('ui.userMenu.hideChat') : t('ui.userMenu.showChat'),
						onClick: () => toggleChatVisibility(),
					},
				]
			: []),
		{
			key: 'logout',
			icon: <LogoutOutlined />,
			label: t('ui.userMenu.logout'),
			onClick: () => handleLogout(),
		},
	];

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="UserDropdown"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div className={styles.root}>
				<Dropdown menu={{ items: menuItems }} trigger={['click']}>
					<Button id={id} type="primary" icon={<UserOutlined className={styles.userIcon} />}>
						<span
							className={classnames([
								styles.username,
								hideTitleOnMobile && styles.hideTitleOnMobile,
							])}
						>
							{username}
						</span>
						<CaretDownOutlined />
					</Button>
				</Dropdown>
				<Modal
					title={t('ui.userMenu.changeName')}
					open={showNameChangeModal}
					handleCancel={() => setShowNameChangeModal(false)}
				>
					<NameChangeModal />
				</Modal>
				<Modal title={t('ui.userMenu.auth')} open={showAuthModal} handleCancel={() => setShowAuthModal(false)}>
					<AuthModal />
				</Modal>
				<Modal
					title={t('purchases.title')}
					open={showPurchasesModal}
					handleCancel={() => setShowPurchasesModal(false)}
				>
					<PurchaseHistoryModal />
				</Modal>
			</div>
		</ErrorBoundary>
	);
};
