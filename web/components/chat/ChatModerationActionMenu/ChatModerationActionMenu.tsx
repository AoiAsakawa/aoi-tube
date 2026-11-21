import { Dropdown, MenuProps, Space, message, Modal as AntModal } from 'antd';
import { FC, useState } from 'react';
import dynamic from '@components/compat/dynamic';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal/Modal';
import type { ChatModerationDetailsModalProps } from '../ChatModerationDetailsModal/ChatModerationDetailsModal';
import styles from './ChatModerationActionMenu.module.scss';
import ChatModeration from '../../../services/moderation-service';

const { confirm } = AntModal;

// Lazy loaded components

// Only moderators ever open this, and it is the one part of the viewer that
// uses antd's Table: keep both out of the bundle everyone downloads. The
// modal mounts its content on first open, which is when this is fetched.
const ChatModerationDetailsModal = dynamic<ChatModerationDetailsModalProps>(
	() =>
		import('../ChatModerationDetailsModal/ChatModerationDetailsModal').then(
			mod => mod.ChatModerationDetailsModal,
		),
	{ ssr: false },
);

const CloseCircleOutlined = dynamic(() => import('@ant-design/icons/CloseCircleOutlined'), {
	ssr: false,
});

const ExclamationCircleOutlined = dynamic(
	() => import('@ant-design/icons/ExclamationCircleOutlined'),
	{
		ssr: false,
	},
);

const EyeInvisibleOutlined = dynamic(() => import('@ant-design/icons/EyeInvisibleOutlined'), {
	ssr: false,
});

const SmallDashOutlined = dynamic(() => import('@ant-design/icons/SmallDashOutlined'), {
	ssr: false,
});

export type ChatModerationActionMenuProps = {
	accessToken: string;
	messageID: string;
	userID: string;
	userDisplayName: string;
};

export const ChatModerationActionMenu: FC<ChatModerationActionMenuProps> = ({
	messageID,
	userID,
	userDisplayName,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);

	const handleBanUser = async () => {
		try {
			await ChatModeration.banUser(userID, accessToken);
		} catch (e) {
			console.error(e);
			message.error(e);
		}
	};

	const handleHideMessage = async () => {
		try {
			await ChatModeration.removeMessage(messageID, accessToken);
		} catch (e) {
			console.error(e);
			message.error(e);
		}
	};

	const confirmHideMessage = async () => {
		confirm({
			icon: <ExclamationCircleOutlined />,
			content: `Are you sure you want to remove this message from ${userDisplayName}?`,
			onOk() {
				handleHideMessage();
			},
		});
	};

	const confirmBanUser = async () => {
		confirm({
			icon: <ExclamationCircleOutlined />,
			content: `Are you sure you want to ban ${userDisplayName} from chat?`,
			onOk() {
				handleBanUser();
			},
		});
	};

	const onMenuClick: MenuProps['onClick'] = ({ key }) => {
		if (key === 'hide-message') {
			confirmHideMessage();
		} else if (key === 'ban-user') {
			confirmBanUser();
		} else if (key === 'more-info') {
			setShowUserDetailsModal(true);
		}
	};

	const menuItems = [
		{
			label: (
				<div>
					<span className={styles.icon}>
						<EyeInvisibleOutlined />
					</span>
					{t('chat.hideMessage')}
				</div>
			),
			key: 'hide-message',
		},
		{
			label: (
				<div>
					<span className={styles.icon}>
						<CloseCircleOutlined />
					</span>
					{t('chat.banUser')}
				</div>
			),
			key: 'ban-user',
		},
		{
			label: <div>{t('chat.moreInfo')}</div>,
			key: 'more-info',
		},
	];

	return (
		<>
			<Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']}>
				<button type="button" onClick={e => e.preventDefault()}>
					<Space>
						<SmallDashOutlined />
					</Space>
				</button>
			</Dropdown>
			<Modal
				title={userDisplayName}
				open={showUserDetailsModal}
				handleCancel={() => {
					setShowUserDetailsModal(false);
				}}
			>
				<ChatModerationDetailsModal userId={userID} accessToken={accessToken} />
			</Modal>
		</>
	);
};
