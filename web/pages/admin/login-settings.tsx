import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Alert,
	Button,
	Card,
	Form,
	Input,
	Modal,
	Popconfirm,
	QRCode,
	Space,
	Spin,
	Table,
	Tag,
	Typography,
	message,
} from 'antd';
import {
	KeyOutlined,
	PlusOutlined,
	SafetyCertificateOutlined,
	ReloadOutlined,
} from '@ant-design/icons';

import { AdminLayout } from '../../components/layouts/AdminLayout';
import * as authelia from '../../services/authelia-service';

const { Title, Paragraph, Text } = Typography;

// Native login-security management backed by the Authelia API (passkeys /
// security keys / TOTP / password) so operators never leave the admin UI.
export default function LoginSettings() {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [available, setAvailable] = useState(true);
	const [username, setUsername] = useState('');
	const [credentials, setCredentials] = useState<authelia.AutheliaCredential[]>([]);
	const [totpRegistered, setTotpRegistered] = useState(false);

	// Elevation (identity re-verification) modal state
	const [elevationVisible, setElevationVisible] = useState(false);
	const [elevationStep, setElevationStep] = useState<'code' | 'secondFactor'>('code');
	const [elevationBusy, setElevationBusy] = useState(false);
	const [oneTimeCode, setOneTimeCode] = useState('');
	const [totpToken, setTotpToken] = useState('');
	const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

	// Add-key modal state
	const [addKeyVisible, setAddKeyVisible] = useState(false);
	const [newKeyName, setNewKeyName] = useState('');
	const [addKeyBusy, setAddKeyBusy] = useState(false);

	// Rename modal state
	const [renameTarget, setRenameTarget] = useState<authelia.AutheliaCredential | null>(null);
	const [renameValue, setRenameValue] = useState('');

	// TOTP registration modal state
	const [totpSetup, setTotpSetup] = useState<{ secret: string; url: string } | null>(null);
	const [totpVerifyToken, setTotpVerifyToken] = useState('');

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const state = await authelia.getSessionState();
			if (state.status !== 'OK') {
				setAvailable(false);
				return;
			}
			setUsername(state.data?.username || '');
			setCredentials(await authelia.getCredentials());
			const totp = await authelia.getTotpConfiguration();
			setTotpRegistered(totp.status === 'OK' && !!totp.data);
		} catch {
			setAvailable(false);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const completeElevation = async () => {
		setElevationVisible(false);
		const action = pendingAction;
		setPendingAction(null);
		if (action) {
			await action();
		}
	};

	// Run an action that may require an elevated session. If Authelia says the
	// session is not elevated, walk through the verification flow first and
	// re-run the action afterwards.
	const withElevation = async (action: () => Promise<void>) => {
		const elevation = await authelia.getElevationState();
		if (elevation?.elevated) {
			await action();
			return;
		}
		setPendingAction(() => action);
		setElevationStep('code');
		setOneTimeCode('');
		setTotpToken('');
		setElevationVisible(true);
		setElevationBusy(true);
		try {
			await authelia.requestOneTimeCode();
			// The code lands in the local notification file; fetch it through
			// the AoiTube backend so no email delivery is needed.
			const code = await authelia.fetchOneTimeCodeFromServer();
			if (code) {
				setOneTimeCode(code);
				message.info(t('admin.pages.loginSettings.messages.codeAutoFetched'));
			}
		} catch {
			// The manual input path still works.
		} finally {
			setElevationBusy(false);
		}
	};

	const submitOneTimeCode = async () => {
		if (!oneTimeCode.trim()) {
			message.error(t('admin.pages.loginSettings.messages.codeRequired'));
			return;
		}
		setElevationBusy(true);
		try {
			const res = await authelia.validateOneTimeCode(oneTimeCode.trim());
			if (res.status !== 'OK') {
				message.error(t('admin.pages.loginSettings.messages.codeInvalid'));
				return;
			}
			const elevation = await authelia.getElevationState();
			if (elevation?.elevated) {
				await completeElevation();
			} else {
				// Second factor (security key or TOTP) is also required.
				setElevationStep('secondFactor');
			}
		} finally {
			setElevationBusy(false);
		}
	};

	const confirmWithSecurityKey = async () => {
		setElevationBusy(true);
		try {
			const res = await authelia.assertWithSecurityKey();
			if (res.status !== 'OK') {
				message.error(t('admin.pages.loginSettings.messages.securityKeyFailed'));
				return;
			}
			await completeElevation();
		} catch {
			message.error(t('admin.pages.loginSettings.messages.securityKeyCancelled'));
		} finally {
			setElevationBusy(false);
		}
	};

	const confirmWithTotp = async () => {
		if (!totpToken.trim()) {
			message.error(t('admin.pages.loginSettings.messages.totpRequired'));
			return;
		}
		setElevationBusy(true);
		try {
			const res = await authelia.assertWithTotp(totpToken.trim());
			if (res.status !== 'OK') {
				message.error(t('admin.pages.loginSettings.messages.totpInvalid'));
				return;
			}
			await completeElevation();
		} finally {
			setElevationBusy(false);
		}
	};

	// --- credential actions ---

	const handleAddKey = () =>
		withElevation(async () => {
			setNewKeyName('');
			setAddKeyVisible(true);
		});

	const performRegistration = async () => {
		if (!newKeyName.trim()) {
			message.error(t('admin.pages.loginSettings.messages.keyNameRequired'));
			return;
		}
		setAddKeyBusy(true);
		try {
			const res = await authelia.registerCredential(newKeyName.trim());
			if (res.status === 'OK') {
				message.success(t('admin.pages.loginSettings.messages.keyAdded'));
				setAddKeyVisible(false);
				await refresh();
			} else {
				message.error(res.message || t('admin.pages.loginSettings.messages.keyAddFailed'));
			}
		} catch {
			message.info(t('admin.pages.loginSettings.messages.keyAddCancelled'));
		} finally {
			setAddKeyBusy(false);
		}
	};

	const handleDelete = (credential: authelia.AutheliaCredential) =>
		withElevation(async () => {
			const res = await authelia.deleteCredential(credential.id);
			if (res.status === 'OK') {
				message.success(
					t('admin.pages.loginSettings.messages.keyDeleted', { name: credential.description }),
				);
				await refresh();
			} else {
				message.error(res.message || t('admin.pages.loginSettings.messages.deleteFailed'));
			}
		});

	const handleRename = async () => {
		if (!renameTarget || !renameValue.trim()) {
			return;
		}
		const target = renameTarget;
		const value = renameValue.trim();
		setRenameTarget(null);
		await withElevation(async () => {
			const res = await authelia.renameCredential(target.id, value);
			if (res.status === 'OK') {
				message.success(t('admin.pages.loginSettings.messages.renamed'));
				await refresh();
			} else {
				message.error(res.message || t('admin.pages.loginSettings.messages.renameFailed'));
			}
		});
	};

	// --- TOTP actions ---

	const handleAddTotp = () =>
		withElevation(async () => {
			const res = await authelia.startTotpRegistration();
			if (res.status === 'OK' && res.data?.otpauth_url) {
				setTotpVerifyToken('');
				setTotpSetup({ secret: res.data.base32_secret, url: res.data.otpauth_url });
			} else {
				message.error(res.message || t('admin.pages.loginSettings.messages.totpStartFailed'));
			}
		});

	const finishTotp = async () => {
		if (!totpVerifyToken.trim()) {
			message.error(t('admin.pages.loginSettings.messages.totpCodeRequired'));
			return;
		}
		const res = await authelia.finishTotpRegistration(totpVerifyToken.trim());
		if (res.status === 'OK') {
			message.success(t('admin.pages.loginSettings.messages.totpRegistered'));
			setTotpSetup(null);
			await refresh();
		} else {
			message.error(t('admin.pages.loginSettings.messages.totpMismatch'));
		}
	};

	const handleDeleteTotp = () =>
		withElevation(async () => {
			const res = await authelia.deleteTotpConfiguration();
			if (res.status === 'OK') {
				message.success(t('admin.pages.loginSettings.messages.totpDeleted'));
				await refresh();
			} else {
				message.error(res.message || t('admin.pages.loginSettings.messages.deleteFailed'));
			}
		});

	// --- password ---

	const handlePasswordChange = async (values: {
		oldPassword: string;
		newPassword: string;
		confirmPassword: string;
	}) => {
		if (values.newPassword !== values.confirmPassword) {
			message.error(t('admin.pages.loginSettings.messages.passwordMismatch'));
			return;
		}
		const res = await authelia.changePassword(username, values.oldPassword, values.newPassword);
		if (res.status === 'OK') {
			message.success(t('admin.pages.loginSettings.messages.passwordChanged'));
		} else {
			message.error(res.message || t('admin.pages.loginSettings.messages.passwordChangeFailed'));
		}
	};

	if (!available) {
		return (
			<div>
				<Title>{t('admin.pages.loginSettings.title')}</Title>
				<Alert
					type="warning"
					showIcon
					message={t('admin.pages.loginSettings.proxyError.message')}
					description={t('admin.pages.loginSettings.proxyError.description')}
				/>
			</div>
		);
	}

	const columns = [
		{
			title: t('admin.pages.common.name'),
			dataIndex: 'description',
			key: 'description',
			render: (text: string) => (
				<Space>
					<KeyOutlined />
					<Text strong>{text}</Text>
				</Space>
			),
		},
		{
			title: t('admin.pages.loginSettings.columns.registeredAt'),
			dataIndex: 'created_at',
			key: 'created_at',
			render: (value?: string) => (value ? new Date(value).toLocaleString() : '-'),
		},
		{
			title: t('admin.pages.loginSettings.columns.lastUsed'),
			dataIndex: 'last_used_at',
			key: 'last_used_at',
			render: (value?: string) => (value ? new Date(value).toLocaleString() : '-'),
		},
		{
			title: t('admin.pages.loginSettings.columns.actions'),
			key: 'actions',
			render: (_: unknown, credential: authelia.AutheliaCredential) => (
				<Space>
					<Button
						size="small"
						onClick={() => {
							setRenameTarget(credential);
							setRenameValue(credential.description);
						}}
					>
						{t('admin.pages.loginSettings.rename')}
					</Button>
					<Popconfirm
						title={t('admin.pages.loginSettings.deleteKeyConfirm', {
							name: credential.description,
						})}
						okText={t('admin.pages.common.delete')}
						cancelText={t('admin.pages.common.cancel')}
						okButtonProps={{ danger: true }}
						onConfirm={() => handleDelete(credential)}
					>
						<Button size="small" danger>
							{t('admin.pages.common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<Title>{t('admin.pages.loginSettings.title')}</Title>
			<p className="description">
				{t('admin.pages.loginSettings.intro')}
				{username && (
					<>
						{' '}
						{t('admin.pages.loginSettings.currentUser')}{' '}
						<Tag icon={<SafetyCertificateOutlined />}>{username}</Tag>
					</>
				)}
			</p>

			<Spin spinning={loading}>
				<Card
					title={t('admin.pages.loginSettings.keysCard.title')}
					style={{ marginBottom: 16 }}
					extra={
						<Space>
							<Button icon={<ReloadOutlined />} onClick={refresh} />
							<Button type="primary" icon={<PlusOutlined />} onClick={handleAddKey}>
								{t('admin.pages.loginSettings.keysCard.addKey')}
							</Button>
						</Space>
					}
				>
					<Table
						rowKey="id"
						columns={columns}
						dataSource={credentials}
						pagination={false}
						locale={{ emptyText: t('admin.pages.loginSettings.keysCard.empty') }}
					/>
				</Card>

				<Card
					title={t('admin.pages.loginSettings.totpCard.title')}
					style={{ marginBottom: 16 }}
					extra={
						totpRegistered ? (
							<Popconfirm
								title={t('admin.pages.loginSettings.totpCard.deleteConfirm')}
								okText={t('admin.pages.common.delete')}
								cancelText={t('admin.pages.common.cancel')}
								okButtonProps={{ danger: true }}
								onConfirm={handleDeleteTotp}
							>
								<Button danger>{t('admin.pages.common.delete')}</Button>
							</Popconfirm>
						) : (
							<Button type="primary" icon={<PlusOutlined />} onClick={handleAddTotp}>
								{t('admin.pages.loginSettings.totpCard.setup')}
							</Button>
						)
					}
				>
					{totpRegistered ? (
						<Text>{t('admin.pages.loginSettings.totpCard.registered')}</Text>
					) : (
						<Text type="secondary">{t('admin.pages.loginSettings.totpCard.notRegistered')}</Text>
					)}
				</Card>

				<Card title={t('admin.pages.loginSettings.passwordCard.title')}>
					<Form layout="vertical" onFinish={handlePasswordChange} style={{ maxWidth: 420 }}>
						<Form.Item
							name="oldPassword"
							label={t('admin.pages.loginSettings.passwordCard.current')}
							rules={[{ required: true }]}
						>
							<Input.Password autoComplete="current-password" />
						</Form.Item>
						<Form.Item
							name="newPassword"
							label={t('admin.pages.loginSettings.passwordCard.new')}
							rules={[{ required: true, min: 8 }]}
						>
							<Input.Password autoComplete="new-password" />
						</Form.Item>
						<Form.Item
							name="confirmPassword"
							label={t('admin.pages.loginSettings.passwordCard.confirm')}
							rules={[{ required: true }]}
						>
							<Input.Password autoComplete="new-password" />
						</Form.Item>
						<Button type="primary" htmlType="submit">
							{t('admin.pages.loginSettings.passwordCard.submit')}
						</Button>
					</Form>
				</Card>
			</Spin>

			{/* Identity verification (elevation) modal */}
			<Modal
				title={t('admin.pages.loginSettings.elevationModal.title')}
				open={elevationVisible}
				onCancel={() => {
					setElevationVisible(false);
					setPendingAction(null);
				}}
				footer={null}
			>
				{elevationStep === 'code' ? (
					<Space direction="vertical" style={{ width: '100%' }}>
						<Paragraph>{t('admin.pages.loginSettings.elevationModal.codeIntro')}</Paragraph>
						<Space.Compact style={{ width: '100%' }}>
							<Input
								placeholder={t('admin.pages.loginSettings.elevationModal.codePlaceholder')}
								value={oneTimeCode}
								onChange={e => setOneTimeCode(e.target.value.toUpperCase())}
								maxLength={8}
							/>
							<Button
								icon={<ReloadOutlined />}
								onClick={async () => {
									const code = await authelia.fetchOneTimeCodeFromServer();
									if (code) {
										setOneTimeCode(code);
									} else {
										message.warning(t('admin.pages.loginSettings.messages.codeNotReady'));
									}
								}}
							/>
						</Space.Compact>
						<Button type="primary" block loading={elevationBusy} onClick={submitOneTimeCode}>
							{t('admin.pages.loginSettings.elevationModal.verify')}
						</Button>
					</Space>
				) : (
					<Space direction="vertical" style={{ width: '100%' }}>
						<Paragraph>{t('admin.pages.loginSettings.elevationModal.secondFactorIntro')}</Paragraph>
						<Button type="primary" block loading={elevationBusy} onClick={confirmWithSecurityKey}>
							{t('admin.pages.loginSettings.elevationModal.securityKeyConfirm')}
						</Button>
						{totpRegistered && (
							<Space.Compact style={{ width: '100%' }}>
								<Input
									placeholder={t('admin.pages.loginSettings.elevationModal.totpPlaceholder')}
									value={totpToken}
									onChange={e => setTotpToken(e.target.value)}
									maxLength={6}
								/>
								<Button loading={elevationBusy} onClick={confirmWithTotp}>
									{t('admin.pages.loginSettings.elevationModal.confirm')}
								</Button>
							</Space.Compact>
						)}
					</Space>
				)}
			</Modal>

			{/* Add key modal */}
			<Modal
				title={t('admin.pages.loginSettings.addKeyModal.title')}
				open={addKeyVisible}
				onCancel={() => setAddKeyVisible(false)}
				onOk={performRegistration}
				okText={t('admin.pages.loginSettings.addKeyModal.okText')}
				cancelText={t('admin.pages.common.cancel')}
				confirmLoading={addKeyBusy}
			>
				<Paragraph>{t('admin.pages.loginSettings.addKeyModal.intro')}</Paragraph>
				<Input
					placeholder={t('admin.pages.loginSettings.addKeyModal.placeholder')}
					value={newKeyName}
					onChange={e => setNewKeyName(e.target.value)}
					maxLength={64}
				/>
			</Modal>

			{/* Rename modal */}
			<Modal
				title={t('admin.pages.loginSettings.renameModal.title')}
				open={!!renameTarget}
				onCancel={() => setRenameTarget(null)}
				onOk={handleRename}
				okText={t('admin.pages.loginSettings.renameModal.okText')}
				cancelText={t('admin.pages.common.cancel')}
			>
				<Input value={renameValue} onChange={e => setRenameValue(e.target.value)} maxLength={64} />
			</Modal>

			{/* TOTP setup modal */}
			<Modal
				title={t('admin.pages.loginSettings.totpModal.title')}
				open={!!totpSetup}
				onCancel={() => setTotpSetup(null)}
				onOk={finishTotp}
				okText={t('admin.pages.loginSettings.totpModal.okText')}
				cancelText={t('admin.pages.common.cancel')}
			>
				{totpSetup && (
					<Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
						<Paragraph>{t('admin.pages.loginSettings.totpModal.scanQr')}</Paragraph>
						<QRCode value={totpSetup.url} style={{ margin: '0 auto' }} />
						<Paragraph copyable={{ text: totpSetup.secret }}>
							<Text type="secondary">
								{t('admin.pages.loginSettings.totpModal.manualSecret', {
									secret: totpSetup.secret,
								})}
							</Text>
						</Paragraph>
						<Input
							placeholder={t('admin.pages.loginSettings.totpModal.codePlaceholder')}
							value={totpVerifyToken}
							onChange={e => setTotpVerifyToken(e.target.value)}
							maxLength={6}
						/>
					</Space>
				)}
			</Modal>
		</div>
	);
}

LoginSettings.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
