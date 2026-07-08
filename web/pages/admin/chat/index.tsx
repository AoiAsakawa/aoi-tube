import React, { useState, useEffect, useContext, ReactElement, useRef } from 'react';
import { Tabs, Table, Typography, Button, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { ColumnsType } from 'antd/es/table';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import dynamic from '@components/compat/dynamic';

import { ServerStatusContext } from '../../../utils/server-status-context';
import { MessageType } from '../../../types/chat';
import {
	CONNECTED_CLIENTS,
	fetchData,
	DISABLED_USERS,
	MODERATORS,
	BANNED_IPS,
	CHAT_HISTORY,
	FETCH_INTERVAL,
	UPDATE_CHAT_MESSGAE_VIZ,
} from '../../../utils/apis';
import { isEmptyObject } from '../../../utils/format';
import { UserTable } from '../../../components/admin/UserTable';
import { ClientTable } from '../../../components/admin/ClientTable';
import { BannedIPsTable } from '../../../components/admin/BannedIPsTable';
import { MessageVisiblityToggle } from '../../../components/admin/MessageVisiblityToggle';
import { UserPopover } from '../../../components/admin/UserPopover';

import { AdminLayout } from '../../../components/layouts/AdminLayout';

const { Title } = Typography;

// Lazy loaded components
const CheckCircleFilled = dynamic(() => import('@ant-design/icons/CheckCircleFilled'), {
	ssr: false,
});

const ExclamationCircleFilled = dynamic(() => import('@ant-design/icons/ExclamationCircleFilled'), {
	ssr: false,
});

// Build username filters
function createUserNameFilters(messages: MessageType[]) {
	const filtered = messages.reduce((acc, curItem) => {
		const curAuthor = curItem.user.id;
		if (!acc.some(item => item.text === curAuthor)) {
			acc.push({ text: curAuthor, value: curAuthor });
		}
		return acc;
	}, []);

	return filtered.sort((a, b) => {
		const nameA = a.text.toUpperCase();
		const nameB = b.text.toUpperCase();
		if (nameA < nameB) return -1;
		if (nameA > nameB) return 1;
		return 0;
	});
}

export const OUTCOME_TIMEOUT = 3000;
export const USER_FETCH_INTERVAL = 10 * 1000; // 10 sec

export default function ChatManagement() {
	const { t } = useTranslation();
	const context = useContext(ServerStatusContext);
	const { online } = context || {};

	// Users state
	const [disabledUsers, setDisabledUsers] = useState([]);
	const [ipBans, setIPBans] = useState([]);
	const [clients, setClients] = useState([]);
	const [moderators, setModerators] = useState([]);

	// Messages state
	const [messages, setMessages] = useState([]);
	const [selectedRowKeys, setSelectedRows] = useState([]);
	const [bulkProcessing, setBulkProcessing] = useState(false);
	const [bulkOutcome, setBulkOutcome] = useState(null);
	const [bulkAction, setBulkAction] = useState('');

	const outcomeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Fetch users data
	const getUsersInfo = async () => {
		try {
			const result = await fetchData(DISABLED_USERS);
			setDisabledUsers(result);
		} catch (error) {
			console.error(error);
		}

		try {
			const result = await fetchData(CONNECTED_CLIENTS);
			setClients(result);
		} catch (error) {
			console.error(error);
		}

		try {
			const result = await fetchData(MODERATORS);
			setModerators(result);
		} catch (error) {
			console.error('error fetching moderators', error);
		}

		try {
			const result = await fetchData(BANNED_IPS);
			setIPBans(result);
		} catch (error) {
			console.error('error fetching banned ips', error);
		}
	};

	// Fetch messages data
	const getMessagesInfo = async () => {
		try {
			const result = await fetchData(CHAT_HISTORY, { auth: true });
			if (isEmptyObject(result)) {
				setMessages([]);
			} else {
				setMessages(result);
			}
		} catch (error) {
			console.error(error);
		}
	};

	useEffect(() => {
		getUsersInfo();
		getMessagesInfo();

		const usersIntervalId = setInterval(getUsersInfo, USER_FETCH_INTERVAL);
		const messagesIntervalId = setInterval(getMessagesInfo, FETCH_INTERVAL);

		return () => {
			clearInterval(usersIntervalId);
			clearInterval(messagesIntervalId);
			if (outcomeTimeoutRef.current) {
				clearTimeout(outcomeTimeoutRef.current);
			}
		};
	}, [online]);

	// Messages handlers
	const nameFilters = createUserNameFilters(messages);

	const rowSelection = {
		selectedRowKeys,
		onChange: (selectedKeys: string[]) => {
			setSelectedRows(selectedKeys);
		},
	};

	const updateMessage = message => {
		const messageIndex = messages.findIndex(m => m.id === message.id);
		messages.splice(messageIndex, 1, message);
		setMessages([...messages]);
	};

	const resetBulkOutcome = () => {
		outcomeTimeoutRef.current = setTimeout(() => {
			setBulkOutcome(null);
			setBulkAction('');
		}, OUTCOME_TIMEOUT);
	};

	const handleSubmitBulk = async bulkVisibility => {
		setBulkProcessing(true);
		const result = await fetchData(UPDATE_CHAT_MESSGAE_VIZ, {
			auth: true,
			method: 'POST',
			data: {
				visible: bulkVisibility,
				idArray: selectedRowKeys,
			},
		});

		if (result.success && result.message === 'changed') {
			setBulkOutcome(<CheckCircleFilled />);
			resetBulkOutcome();

			const updatedList = [...messages];
			selectedRowKeys.map(key => {
				const messageIndex = updatedList.findIndex(m => m.id === key);
				const newMessage = { ...messages[messageIndex], visible: bulkVisibility };
				updatedList.splice(messageIndex, 1, newMessage);
				return null;
			});
			setMessages(updatedList);
			setSelectedRows([]);
		} else {
			setBulkOutcome(<ExclamationCircleFilled />);
			resetBulkOutcome();
		}
		setBulkProcessing(false);
	};

	const handleSubmitBulkShow = () => {
		setBulkAction('show');
		handleSubmitBulk(true);
	};

	const handleSubmitBulkHide = () => {
		setBulkAction('hide');
		handleSubmitBulk(false);
	};

	// Messages columns definition
	const chatColumns: ColumnsType<MessageType> = [
		{
			title: t('admin.pages.chat.columns.time'),
			dataIndex: 'timestamp',
			key: 'timestamp',
			className: 'timestamp-col',
			defaultSortOrder: 'descend',
			render: timestamp => {
				const dateObject = new Date(timestamp);
				return format(dateObject, 'PP pp', { locale: ja });
			},
			sorter: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			width: 90,
		},
		{
			title: t('admin.pages.chat.columns.user'),
			dataIndex: 'user',
			key: 'user',
			className: 'name-col',
			filters: nameFilters,
			onFilter: (value, record) => record.user.id === value,
			sorter: (a, b) => a.user.displayName.localeCompare(b.user.displayName),
			sortDirections: ['ascend', 'descend'],
			ellipsis: true,
			render: user => {
				const { displayName } = user;
				return <UserPopover user={user}>{displayName}</UserPopover>;
			},
			width: 110,
		},
		{
			title: t('admin.pages.chat.columns.message'),
			dataIndex: 'body',
			key: 'body',
			className: 'message-col',
			width: 320,
			render: body => (
				<div className="message-contents" dangerouslySetInnerHTML={{ __html: body }} />
			),
		},
		{
			title: '',
			dataIndex: 'hiddenAt',
			key: 'hiddenAt',
			className: 'toggle-col',
			filters: [
				{ text: t('admin.pages.chat.filters.visible'), value: true },
				{ text: t('admin.pages.chat.filters.hidden'), value: false },
			],
			onFilter: (value, record) => record.visible === value,
			render: (hiddenAt, record) => (
				<MessageVisiblityToggle isVisible={!hiddenAt} message={record} setMessage={updateMessage} />
			),
			width: 30,
		},
	];

	const bulkDivClasses = classNames({
		'bulk-editor': true,
		active: selectedRowKeys.length,
	});

	// Users tab labels
	const connectedUserTabTitle = (
		<span>
			{t('admin.pages.chat.tabs.connected')}{' '}
			{online ? `(${clients.length})` : t('admin.pages.chat.tabs.offline')}
		</span>
	);
	const bannedUsersTabTitle = (
		<span>
			{t('admin.pages.chat.tabs.banned')} ({disabledUsers.length})
		</span>
	);
	const bannedIPTabTitle = (
		<span>
			{t('admin.pages.chat.tabs.ipBans')} ({ipBans.length})
		</span>
	);
	const moderatorUsersTabTitle = (
		<span>
			{t('admin.pages.chat.tabs.moderators')} ({moderators.length})
		</span>
	);

	// Connected users content
	const connectedUsersContent = online ? (
		<>
			<ClientTable data={clients} />
			<p className="description">
				{t('admin.pages.chat.viewerDocsPre')}{' '}
				<a
					href="https://owncast.online/docs/viewers/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.pages.common.documentation')}
				</a>{' '}
				{t('admin.pages.chat.viewerDocsPost')}
			</p>
		</>
	) : (
		<p className="description">{t('admin.pages.chat.offlineDescription')}</p>
	);

	// User management tabs
	const userTabItems = [
		{ label: connectedUserTabTitle, key: 'connected', children: connectedUsersContent },
		{ label: bannedUsersTabTitle, key: 'banned', children: <UserTable data={disabledUsers} /> },
		{ label: bannedIPTabTitle, key: 'ip-banned', children: <BannedIPsTable data={ipBans} /> },
		{ label: moderatorUsersTabTitle, key: 'moderators', children: <UserTable data={moderators} /> },
	];

	return (
		<div className="chat-management">
			<Title>{t('admin.pages.chat.title')}</Title>

			{/* User management section */}
			<Tabs defaultActiveKey="connected" items={userTabItems} />

			<Divider />

			{/* Message management section */}
			<Title level={3}>{t('admin.pages.chat.messageHistory', { num: messages.length })}</Title>
			<p>{t('admin.pages.chat.messageHistoryIntro')}</p>

			<div className={bulkDivClasses}>
				<span className="label">{t('admin.pages.chat.bulkLabel')}</span>

				<Button
					type="primary"
					size="small"
					shape="round"
					className="button"
					loading={bulkAction === 'show' && bulkProcessing}
					icon={bulkAction === 'show' && bulkOutcome}
					disabled={!selectedRowKeys.length || (bulkAction && bulkAction !== 'show')}
					onClick={handleSubmitBulkShow}
				>
					{t('admin.pages.chat.bulkShow')}
				</Button>
				<Button
					type="primary"
					size="small"
					shape="round"
					className="button"
					loading={bulkAction === 'hide' && bulkProcessing}
					icon={bulkAction === 'hide' && bulkOutcome}
					disabled={!selectedRowKeys.length || (bulkAction && bulkAction !== 'hide')}
					onClick={handleSubmitBulkHide}
				>
					{t('admin.pages.chat.bulkHide')}
				</Button>
			</div>

			<Table
				size="small"
				className="table-container"
				pagination={{ defaultPageSize: 100, showSizeChanger: true }}
				scroll={{ y: 540 }}
				rowClassName={record => (record.hiddenAt ? 'hidden' : '')}
				dataSource={messages}
				columns={chatColumns}
				rowKey={row => row.id}
				rowSelection={rowSelection}
			/>
		</div>
	);
}

ChatManagement.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
