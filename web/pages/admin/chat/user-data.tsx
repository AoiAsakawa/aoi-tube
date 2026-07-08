import React, { useState, useEffect, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Table,
	Button,
	Modal,
	Tag,
	Space,
	Input,
	Typography,
	Popconfirm,
	message,
	Card,
	Statistic,
	Row,
	Col,
	theme,
} from 'antd';
import {
	DeleteOutlined,
	SearchOutlined,
	ExclamationCircleOutlined,
	ReloadOutlined,
	UserOutlined,
	CheckCircleOutlined,
	StopOutlined,
} from '@ant-design/icons';
import { AdminLayout } from '../../../components/layouts/AdminLayout';
import { ALL_USERS, DELETE_USER, DELETE_ALL_USERS, fetchData } from '../../../utils/apis';

const { Text, Title } = Typography;
const { confirm } = Modal;

interface User {
	id: string;
	displayName: string;
	displayColor: number;
	createdAt: string;
	disabledAt?: string;
	authenticated: boolean;
	authenticatedAt?: string;
	authType?: string;
	authTypes?: string[];
	scopes?: string[];
	previousNames?: string[];
}

export default function UserDataManagement() {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchText, setSearchText] = useState('');
	const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

	const fetchUsers = async () => {
		setLoading(true);
		try {
			const result = await fetchData(ALL_USERS);
			setUsers(result || []);
		} catch (error) {
			console.error('Error fetching users:', error);
			message.error(t('admin.pages.userData.messages.fetchFailed'));
		}
		setLoading(false);
	};

	useEffect(() => {
		fetchUsers();
	}, []);

	const handleDeleteUser = async (userId: string) => {
		try {
			const response = await fetch(DELETE_USER, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({ userId }),
			});

			if (response.ok) {
				message.success(t('admin.pages.userData.messages.deleted'));
				fetchUsers();
			} else {
				message.error(t('admin.pages.userData.messages.deleteFailed'));
			}
		} catch (error) {
			console.error('Error deleting user:', error);
			message.error(t('admin.pages.userData.messages.deleteFailed'));
		}
	};

	const handleDeleteSelected = async () => {
		if (selectedRowKeys.length === 0) {
			message.warning(t('admin.pages.userData.messages.selectUsers'));
			return;
		}

		confirm({
			title: t('admin.pages.userData.deleteSelectedConfirm.title', {
				num: selectedRowKeys.length,
			}),
			icon: <ExclamationCircleOutlined />,
			content: t('admin.pages.userData.deleteSelectedConfirm.content'),
			okText: t('admin.pages.common.delete'),
			okType: 'danger',
			cancelText: t('admin.pages.common.cancel'),
			async onOk() {
				for (const userId of selectedRowKeys) {
					await handleDeleteUser(userId);
				}
				setSelectedRowKeys([]);
			},
		});
	};

	const handleDeleteAllUsers = async () => {
		confirm({
			title: t('admin.pages.userData.deleteAllConfirm.title'),
			icon: <ExclamationCircleOutlined />,
			content: t('admin.pages.userData.deleteAllConfirm.content'),
			okText: t('admin.pages.userData.deleteAllConfirm.okText'),
			okType: 'danger',
			cancelText: t('admin.pages.common.cancel'),
			async onOk() {
				try {
					const response = await fetch(DELETE_ALL_USERS, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						credentials: 'include',
					});

					if (response.ok) {
						message.success(t('admin.pages.userData.messages.allDeleted'));
						fetchUsers();
					} else {
						message.error(t('admin.pages.userData.messages.deleteAllFailed'));
					}
				} catch (error) {
					console.error('Error deleting all users:', error);
					message.error(t('admin.pages.userData.messages.deleteAllFailed'));
				}
			},
		});
	};

	const filteredUsers = users.filter(
		user =>
			user.displayName.toLowerCase().includes(searchText.toLowerCase()) ||
			user.id.toLowerCase().includes(searchText.toLowerCase()),
	);

	const authenticatedCount = users.filter(u => u.authenticated).length;
	const disabledCount = users.filter(u => u.disabledAt).length;
	const moderatorCount = users.filter(u => u.scopes?.includes('MODERATOR')).length;

	const columns = [
		{
			title: 'ID',
			dataIndex: 'id',
			key: 'id',
			width: 120,
			ellipsis: true,
			render: (id: string) => (
				<Text copyable={{ text: id }} style={{ fontSize: '12px' }}>
					{id.substring(0, 8)}...
				</Text>
			),
		},
		{
			title: t('admin.pages.userData.columns.displayName'),
			dataIndex: 'displayName',
			key: 'displayName',
			render: (name: string, record: User) => (
				<Space>
					<span
						style={{
							width: 12,
							height: 12,
							borderRadius: '50%',
							backgroundColor: `hsl(${record.displayColor}, 70%, 50%)`,
							display: 'inline-block',
						}}
					/>
					<span>{name}</span>
				</Space>
			),
		},
		{
			title: t('admin.pages.userData.columns.status'),
			key: 'status',
			width: 250,
			render: (_: any, record: User) => (
				<Space wrap>
					{record.authenticated && (
						<Tag color="green">{t('admin.pages.userData.tags.authenticated')}</Tag>
					)}
					{record.authTypes && record.authTypes.length > 0 && (
						<>
							{record.authTypes.map(type => {
								let color = 'default';
								let label = type;
								switch (type) {
									case 'twitter':
										color = 'blue';
										label = 'X';
										break;
									case 'discord':
										color = 'purple';
										label = 'Discord';
										break;
									case 'google':
										color = 'red';
										label = 'Google';
										break;
									case 'fediverse':
										color = 'orange';
										label = 'Fediverse';
										break;
									case 'indieauth':
										color = 'cyan';
										label = 'IndieAuth';
										break;
								}
								return (
									<Tag key={type} color={color}>
										{label}
									</Tag>
								);
							})}
						</>
					)}
					{record.disabledAt && <Tag color="red">{t('admin.pages.userData.tags.blocked')}</Tag>}
					{record.scopes?.includes('MODERATOR') && (
						<Tag color="blue">{t('admin.pages.userData.tags.moderator')}</Tag>
					)}
					{!record.authenticated && !record.disabledAt && !record.scopes?.includes('MODERATOR') && (
						<Tag color="default">{t('admin.pages.userData.tags.unauthenticated')}</Tag>
					)}
				</Space>
			),
		},
		{
			title: t('admin.pages.userData.columns.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
			render: (date: string) => new Date(date).toLocaleString('ja-JP'),
			sorter: (a: User, b: User) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		},
		{
			title: t('admin.pages.userData.columns.authenticatedAt'),
			dataIndex: 'authenticatedAt',
			key: 'authenticatedAt',
			width: 180,
			render: (date: string) => (date ? new Date(date).toLocaleString('ja-JP') : '-'),
		},
		{
			title: t('admin.pages.userData.columns.action'),
			key: 'action',
			width: 100,
			render: (_: any, record: User) => (
				<Popconfirm
					title={t('admin.pages.userData.deleteUserConfirm.title')}
					description={t('admin.pages.userData.deleteUserConfirm.description')}
					onConfirm={() => handleDeleteUser(record.id)}
					okText={t('admin.pages.common.delete')}
					cancelText={t('admin.pages.common.cancel')}
					okButtonProps={{ danger: true }}
				>
					<Button type="text" danger icon={<DeleteOutlined />} size="small" />
				</Popconfirm>
			),
		},
	];

	const rowSelection = {
		selectedRowKeys,
		onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
	};

	return (
		<div>
			<Title level={3}>{t('admin.pages.userData.title')}</Title>
			<Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
				{t('admin.pages.userData.intro')}
			</Text>

			<Row gutter={16} style={{ marginBottom: 24 }}>
				<Col span={6}>
					<Card>
						<Statistic
							title={t('admin.pages.userData.stats.totalUsers')}
							value={users.length}
							prefix={<UserOutlined />}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card>
						<Statistic
							title={t('admin.pages.userData.stats.authenticated')}
							value={authenticatedCount}
							prefix={<CheckCircleOutlined />}
							valueStyle={{ color: token.colorSuccess }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card>
						<Statistic
							title={t('admin.pages.userData.stats.blocked')}
							value={disabledCount}
							prefix={<StopOutlined />}
							valueStyle={{ color: token.colorError }}
						/>
					</Card>
				</Col>
				<Col span={6}>
					<Card>
						<Statistic
							title={t('admin.pages.userData.stats.moderators')}
							value={moderatorCount}
							prefix={<UserOutlined />}
							valueStyle={{ color: token.colorInfo }}
						/>
					</Card>
				</Col>
			</Row>

			<Space style={{ marginBottom: 16 }} wrap>
				<Input
					placeholder={t('admin.pages.userData.searchPlaceholder')}
					prefix={<SearchOutlined />}
					value={searchText}
					onChange={e => setSearchText(e.target.value)}
					style={{ width: 250 }}
					allowClear
				/>
				<Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
					{t('admin.pages.userData.refresh')}
				</Button>
				<Button
					danger
					icon={<DeleteOutlined />}
					onClick={handleDeleteSelected}
					disabled={selectedRowKeys.length === 0}
				>
					{t('admin.pages.userData.deleteSelected', { num: selectedRowKeys.length })}
				</Button>
				<Button
					danger
					type="primary"
					icon={<DeleteOutlined />}
					onClick={handleDeleteAllUsers}
					disabled={users.length === 0}
				>
					{t('admin.pages.userData.deleteAll')}
				</Button>
			</Space>

			<Table
				rowSelection={rowSelection}
				columns={columns}
				dataSource={filteredUsers}
				rowKey="id"
				loading={loading}
				pagination={{
					// defaultPageSize (not pageSize) keeps the pagination uncontrolled
					// so the size changer actually applies; a controlled pageSize
					// snaps back to 20 on every re-render.
					defaultPageSize: 20,
					showSizeChanger: true,
					pageSizeOptions: [10, 20, 50, 100, 200],
					showTotal: total => t('admin.pages.userData.totalItems', { num: total }),
				}}
				size="small"
				scroll={{ x: 900 }}
			/>
		</div>
	);
}

UserDataManagement.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
