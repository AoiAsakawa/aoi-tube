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
	Select,
	Tooltip,
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
	HistoryOutlined,
	MergeCellsOutlined,
	SafetyCertificateOutlined,
} from '@ant-design/icons';
import { AdminLayout } from '../../../components/layouts/AdminLayout';
import {
	ALL_USERS,
	DELETE_USER,
	DELETE_ALL_USERS,
	USER_AUTH_EVENTS,
	USER_AUTH_REACTIVATE,
	USER_MERGE,
	USER_SET_MODERATOR,
	fetchData,
} from '../../../utils/apis';

const { Text, Title } = Typography;
const { confirm } = Modal;

// Display metadata for each auth provider type. 'x' is the current X OAuth 2.0
// login; 'twitter' is the legacy OAuth 1.0a flow — both surface as "X".
const getProviderMeta = (type: string): { color: string; label: string } => {
	switch (type) {
		case 'x':
		case 'twitter':
			return { color: 'blue', label: 'X' };
		case 'github':
			return { color: 'geekblue', label: 'GitHub' };
		case 'discord':
			return { color: 'purple', label: 'Discord' };
		case 'google':
			return { color: 'red', label: 'Google' };
		case 'fediverse':
			return { color: 'orange', label: 'Fediverse' };
		case 'indieauth':
			return { color: 'cyan', label: 'IndieAuth' };
		default:
			return { color: 'default', label: type };
	}
};

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
	// Linked social accounts with their handles (e.g. an X @handle or a GitHub
	// login). Shown to the operator only; not the public chat name. revoked
	// marks an unlinked account, kept as history for provenance; token is the
	// provider identity used to reactivate a specific revoked link.
	authDetails?: { type: string; handle?: string; revoked?: boolean; token?: string }[];
	scopes?: string[];
	previousNames?: string[];
}

interface AuthEvent {
	id: number;
	userId: string;
	type: string;
	handle?: string;
	action: string;
	actor: string;
	createdAt: string;
}

export default function UserDataManagement() {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchText, setSearchText] = useState('');
	const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
	// Governance: audit-log viewer, account-merge dialog, and per-link recovery.
	const [auditUser, setAuditUser] = useState<User | null>(null);
	const [auditEvents, setAuditEvents] = useState<AuthEvent[]>([]);
	const [auditLoading, setAuditLoading] = useState(false);
	const [mergeSource, setMergeSource] = useState<User | null>(null);
	const [mergeTargetId, setMergeTargetId] = useState<string>('');
	const [reactivating, setReactivating] = useState<string | null>(null);

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

	// POST helper for the admin governance endpoints (Basic-auth via the
	// browser session, matching the delete handlers above).
	const adminPost = async (url: string, body: unknown): Promise<boolean> => {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(body),
			});
			const data = await response.json().catch(() => ({}));
			return response.ok && data.success !== false;
		} catch (_e) {
			return false;
		}
	};

	const handleSetModerator = async (userId: string, isModerator: boolean) => {
		const ok = await adminPost(USER_SET_MODERATOR, { userId, isModerator });
		if (ok) {
			message.success(
				isModerator
					? t('admin.pages.userData.governance.moderatorGranted')
					: t('admin.pages.userData.governance.moderatorRevoked'),
			);
			fetchUsers();
		} else {
			message.error(t('admin.pages.userData.governance.moderatorFailed'));
		}
	};

	const openAuditLog = async (user: User) => {
		setAuditUser(user);
		setAuditEvents([]);
		setAuditLoading(true);
		try {
			const result = await fetchData(`${USER_AUTH_EVENTS}?userId=${encodeURIComponent(user.id)}`);
			setAuditEvents(result?.events || []);
		} catch (_e) {
			message.error(t('admin.pages.userData.governance.auditLoadFailed'));
		}
		setAuditLoading(false);
	};

	const handleReactivate = async (userId: string, type: string, tok?: string) => {
		if (!tok) {
			return;
		}
		setReactivating(`${userId}:${tok}`);
		const ok = await adminPost(USER_AUTH_REACTIVATE, { userId, type, token: tok });
		setReactivating(null);
		if (ok) {
			message.success(t('admin.pages.userData.governance.reactivateSuccess'));
			fetchUsers();
		} else {
			message.error(t('admin.pages.userData.governance.reactivateFailed'));
		}
	};

	const handleMerge = async () => {
		if (!mergeSource || !mergeTargetId) {
			return;
		}
		const ok = await adminPost(USER_MERGE, {
			sourceUserId: mergeSource.id,
			targetUserId: mergeTargetId,
		});
		if (ok) {
			message.success(t('admin.pages.userData.governance.mergeSuccess'));
			setMergeSource(null);
			setMergeTargetId('');
			fetchUsers();
		} else {
			message.error(t('admin.pages.userData.governance.mergeFailed'));
		}
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
			width: 90,
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
			width: 150,
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
			// Linked social accounts, one per line with the handle, so long
			// handles stay readable instead of wrapping together with the status
			// tags.
			title: t('admin.pages.userData.columns.auth'),
			key: 'auth',
			width: 190,
			render: (_: any, record: User) => {
				const entries: { type: string; handle?: string; revoked?: boolean; token?: string }[] =
					record.authDetails && record.authDetails.length > 0
						? record.authDetails
						: (record.authTypes ?? []).map(type => ({ type }));
				if (entries.length === 0) {
					return <Text type="secondary">—</Text>;
				}
				return (
					<Space direction="vertical" size={2} style={{ display: 'flex' }}>
						{entries.map(({ type, handle, revoked }, i) => {
							const { color, label } = getProviderMeta(type);
							return (
								<span
									key={`${type}-${i}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										opacity: revoked ? 0.5 : 1,
									}}
								>
									<Tag
										color={revoked ? 'default' : color}
										style={{ margin: 0, textDecoration: revoked ? 'line-through' : undefined }}
									>
										{label}
									</Tag>
									{handle && (
										<Text
											delete={revoked}
											type="secondary"
											style={{ fontSize: 12, wordBreak: 'break-all' }}
											title={handle}
										>
											{handle}
										</Text>
									)}
									{revoked && (
										<>
											<Text type="secondary" style={{ fontSize: 11 }}>
												({t('admin.pages.userData.tags.unlinked')})
											</Text>
											<Button
												size="small"
												type="link"
												style={{ padding: 0, height: 'auto', fontSize: 11 }}
												loading={reactivating === `${record.id}:${entries[i].token}`}
												onClick={() => handleReactivate(record.id, type, entries[i].token)}
											>
												{t('admin.pages.userData.governance.reactivate')}
											</Button>
										</>
									)}
								</span>
							);
						})}
					</Space>
				);
			},
		},
		{
			title: t('admin.pages.userData.columns.status'),
			key: 'status',
			width: 100,
			render: (_: any, record: User) => (
				<Space direction="vertical" size={2} style={{ display: 'flex' }}>
					<Tag color={record.authenticated ? 'green' : 'default'} style={{ margin: 0 }}>
						{record.authenticated
							? t('admin.pages.userData.tags.authenticated')
							: t('admin.pages.userData.tags.unauthenticated')}
					</Tag>
					{record.scopes?.includes('MODERATOR') && (
						<Tag color="blue" style={{ margin: 0 }}>
							{t('admin.pages.userData.tags.moderator')}
						</Tag>
					)}
					{record.disabledAt && (
						<Tag color="red" style={{ margin: 0 }}>
							{t('admin.pages.userData.tags.blocked')}
						</Tag>
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
			width: 150,
			render: (_: any, record: User) => {
				const isModerator = record.scopes?.includes('MODERATOR') ?? false;
				return (
					<Space size={4}>
						<Popconfirm
							title={
								isModerator
									? t('admin.pages.userData.governance.moderatorRevokeConfirm', {
											name: record.displayName,
										})
									: t('admin.pages.userData.governance.moderatorGrantConfirm', {
											name: record.displayName,
										})
							}
							okText={
								isModerator
									? t('admin.pages.userData.governance.moderatorRevokeAction')
									: t('admin.pages.userData.governance.moderatorGrantAction')
							}
							cancelText={t('admin.pages.common.cancel')}
							okButtonProps={{ danger: isModerator }}
							onConfirm={() => handleSetModerator(record.id, !isModerator)}
						>
							<Tooltip
								title={
									isModerator
										? t('admin.pages.userData.governance.moderatorRevokeAction')
										: t('admin.pages.userData.governance.moderatorGrantAction')
								}
							>
								<Button
									size="small"
									icon={<SafetyCertificateOutlined />}
									type={isModerator ? 'primary' : 'default'}
								/>
							</Tooltip>
						</Popconfirm>
						<Tooltip title={t('admin.pages.userData.governance.history')}>
							<Button
								size="small"
								icon={<HistoryOutlined />}
								onClick={() => openAuditLog(record)}
							/>
						</Tooltip>
						<Tooltip title={t('admin.pages.userData.governance.merge')}>
							<Button
								size="small"
								icon={<MergeCellsOutlined />}
								onClick={() => {
									setMergeSource(record);
									setMergeTargetId('');
								}}
							/>
						</Tooltip>
						<Popconfirm
							title={t('admin.pages.userData.deleteUserConfirm.title')}
							description={t('admin.pages.userData.deleteUserConfirm.description')}
							onConfirm={() => handleDeleteUser(record.id)}
							okText={t('admin.pages.common.delete')}
							cancelText={t('admin.pages.common.cancel')}
							okButtonProps={{ danger: true }}
						>
							<Tooltip title={t('admin.pages.common.delete')}>
								<Button type="text" danger icon={<DeleteOutlined />} size="small" />
							</Tooltip>
						</Popconfirm>
					</Space>
				);
			},
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
				scroll={{ x: 'max-content' }}
			/>

			{/* Authentication audit log: append-only link/unlink/merge history. */}
			<Modal
				title={t('admin.pages.userData.governance.auditTitle', {
					name: auditUser?.displayName ?? '',
				})}
				open={auditUser !== null}
				onCancel={() => setAuditUser(null)}
				footer={null}
				width={640}
			>
				<Table
					dataSource={auditEvents}
					rowKey="id"
					loading={auditLoading}
					size="small"
					pagination={false}
					scroll={{ y: 360 }}
					locale={{ emptyText: t('admin.pages.userData.governance.auditEmpty') }}
					columns={[
						{
							title: t('admin.pages.userData.governance.auditWhen'),
							dataIndex: 'createdAt',
							key: 'createdAt',
							render: (d: string) => new Date(d).toLocaleString('ja-JP'),
						},
						{
							title: t('admin.pages.userData.governance.auditAction'),
							dataIndex: 'action',
							key: 'action',
							render: (action: string, e: AuthEvent) => (
								<span>
									<Tag>{t(`admin.pages.userData.governance.actions.${action}`, action)}</Tag>
									{e.type ? (
										<Text type="secondary" style={{ fontSize: 12 }}>
											{getProviderMeta(e.type).label}
											{e.handle ? ` · ${e.handle}` : ''}
										</Text>
									) : null}
								</span>
							),
						},
						{
							title: t('admin.pages.userData.governance.auditActor'),
							dataIndex: 'actor',
							key: 'actor',
							width: 90,
							render: (actor: string) => (
								<Tag color={actor === 'admin' ? 'blue' : 'default'}>
									{t(`admin.pages.userData.governance.actors.${actor}`, actor)}
								</Tag>
							),
						},
					]}
				/>
			</Modal>

			{/* Account merge: consolidate a duplicate identity into another user. */}
			<Modal
				title={t('admin.pages.userData.governance.mergeTitle')}
				open={mergeSource !== null}
				onCancel={() => setMergeSource(null)}
				onOk={handleMerge}
				okText={t('admin.pages.userData.governance.mergeConfirm')}
				okButtonProps={{ disabled: !mergeTargetId, danger: true }}
			>
				<Text style={{ display: 'block', marginBottom: 12 }}>
					{t('admin.pages.userData.governance.mergeIntro', {
						name: mergeSource?.displayName ?? '',
					})}
				</Text>
				<Select
					showSearch
					style={{ width: '100%' }}
					placeholder={t('admin.pages.userData.governance.mergeTargetPlaceholder')}
					value={mergeTargetId || undefined}
					onChange={setMergeTargetId}
					optionFilterProp="label"
					options={users
						.filter(u => u.id !== mergeSource?.id)
						.map(u => ({
							value: u.id,
							label: `${u.displayName} (${u.id.slice(0, 8)})`,
						}))}
				/>
				<Text type="warning" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
					{t('admin.pages.userData.governance.mergeWarning')}
				</Text>
			</Modal>
		</div>
	);
}

UserDataManagement.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
