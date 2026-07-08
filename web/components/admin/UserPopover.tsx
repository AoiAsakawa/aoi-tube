// This displays a clickable user name (or whatever children element you provide), and displays a simple tooltip of created time. OnClick a modal with more information about the user is displayed.

import { useState, ReactNode, FC } from 'react';
import { Divider, Modal, Typography, Row, Col, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow, format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { uniq } from 'lodash';

import { BanUserButton } from './BanUserButton';
import { ModeratorUserButton } from './ModeratorUserButton';

import { User, UserConnectionInfo } from '../../types/chat';
import { formatDisplayDate } from './UserTable';
import { formatUAstring } from '../../utils/format';

export type UserPopoverProps = {
	user: User;
	connectionInfo?: UserConnectionInfo | null;
	children: ReactNode;
};

export const UserPopover: FC<UserPopoverProps> = ({ user, connectionInfo = null, children }) => {
	const { t } = useTranslation();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const handleShowModal = () => {
		setIsModalOpen(true);
	};
	const handleCloseModal = () => {
		setIsModalOpen(false);
	};

	const { displayName, createdAt, previousNames, nameChangedAt, disabledAt } = user;
	const { connectedAt, messageCount, userAgent } = connectionInfo || {};

	let lastNameChangeDate = null;
	const nameList = previousNames && [...previousNames];

	if (previousNames && previousNames.length > 1 && nameChangedAt) {
		lastNameChangeDate = new Date(nameChangedAt);
		// reverse prev names for display purposes
		nameList.reverse();
	}

	const dateObject = new Date(createdAt);
	const createdAtDate = format(dateObject, 'yyyy/MM/dd HH:mm');

	const lastNameChangeDuration = lastNameChangeDate
		? formatDistanceToNow(lastNameChangeDate, { locale: ja })
		: null;

	return (
		<>
			<Tooltip
				title={
					<>
						{t('admin.layout.userPopover.createdAt', { date: createdAtDate })}
						<br /> {t('admin.layout.userPopover.clickForDetails')}
					</>
				}
				placement="bottomLeft"
			>
				<button
					type="button"
					aria-label={t('admin.layout.userPopover.viewDetailsAria')}
					className="user-item-container"
					onClick={handleShowModal}
				>
					{children}
				</button>
			</Tooltip>

			<Modal
				destroyOnHidden
				width={600}
				cancelText={t('admin.layout.userPopover.close')}
				okButtonProps={{ style: { display: 'none' } }}
				title={t('admin.layout.userPopover.title', { name: displayName })}
				open={isModalOpen}
				onOk={handleCloseModal}
				onCancel={handleCloseModal}
				className="dark-modal"
			>
				<div className="user-details">
					<Typography.Title level={4}>{displayName}</Typography.Title>
					<p className="created-at">
						{t('admin.layout.userPopover.createdAt', { date: createdAtDate })}
					</p>
					<Row gutter={16}>
						{connectionInfo && (
							<Col md={lastNameChangeDate ? 12 : 24}>
								<Typography.Title level={5}>
									{t('admin.layout.userPopover.connectedNow')}
								</Typography.Title>
								<ul className="connection-info">
									<li>
										<strong>{t('admin.layout.userPopover.connectionDuration')}</strong>{' '}
										{formatDistanceToNow(new Date(connectedAt), { locale: ja })}
									</li>
									<li>
										<strong>{t('admin.layout.userPopover.messageCount')}</strong> {messageCount}
									</li>
									<li>
										<strong>{t('admin.layout.userPopover.userAgent')}</strong>
										<br />
										{formatUAstring(userAgent)}
									</li>
								</ul>
							</Col>
						)}
						{lastNameChangeDate && (
							<Col md={connectionInfo ? 12 : 24}>
								<Typography.Title level={5}>
									{t('admin.layout.userPopover.previousNames')}
								</Typography.Title>
								<ul className="previous-names-list">
									{uniq(nameList).map((name, index) => (
										<li key={`name-${name}-${index}`} className={index === 0 ? 'latest' : ''}>
											<span className="user-name-item">{name}</span>
											{index === 0 && lastNameChangeDuration
												? t('admin.layout.userPopover.nameChangedAgo', {
														duration: lastNameChangeDuration,
													})
												: ''}
										</li>
									))}
								</ul>
							</Col>
						)}
					</Row>
					<Divider />
					<Space direction="horizontal">
						{disabledAt ? (
							<>
								{t('admin.layout.userPopover.bannedAtPrefix')}{' '}
								<code>{formatDisplayDate(disabledAt)}</code>{' '}
								{t('admin.layout.userPopover.bannedAtSuffix')}
								<br />
								<br />
								<BanUserButton
									label={t('admin.layout.banUserButton.unbanAction')}
									user={user}
									isEnabled={false}
									onClick={handleCloseModal}
								/>
							</>
						) : (
							<BanUserButton
								label={t('admin.layout.banUserButton.banAction')}
								user={user}
								isEnabled
								onClick={handleCloseModal}
							/>
						)}
						<ModeratorUserButton user={user} onClick={handleCloseModal} />
					</Space>
				</div>
			</Modal>
		</>
	);
};
