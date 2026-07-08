import { Typography, Switch, Input, Button, Alert, Space, message, Tooltip, Table } from 'antd';
import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_KOFI_CONFIG, ADMIN_KOFI_CONFIG_SET, NEXT_PUBLIC_API_HOST } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';
import { SetupGuide } from '../../components/admin/SetupGuide';
import {
	SCREEN_EFFECT_EMOJIS,
	SCREEN_EFFECT_NAMES_JA,
	SCREEN_EFFECT_PRICES,
	SCREEN_EFFECT_TYPES,
} from '../../interfaces/donation.model';

const { Paragraph, Text } = Typography;

// Rows for the screen-effect command table, derived from the shared price
// table so this page can never drift from what the server enforces.
const EFFECT_COMMAND_ROWS = SCREEN_EFFECT_TYPES.map(effect => ({
	key: effect,
	command: `!${effect}`,
	name: `${SCREEN_EFFECT_EMOJIS[effect]} ${SCREEN_EFFECT_NAMES_JA[effect]}`,
	priceJpy: `¥${SCREEN_EFFECT_PRICES[effect].JPY.toLocaleString()}`,
	priceUsd: `$${SCREEN_EFFECT_PRICES[effect].USD.toLocaleString()}`,
}));

interface KofiConfig {
	enabled: boolean;
	verificationToken: string;
	pageUrl: string;
	displayName: string;
}

const KofiConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<KofiConfig>(
		ADMIN_KOFI_CONFIG,
		ADMIN_KOFI_CONFIG_SET,
		{ enabled: false, verificationToken: '', pageUrl: '', displayName: '' },
		{
			validate: c =>
				c.pageUrl && !c.pageUrl.startsWith('https://ko-fi.com/')
					? t('admin.config.kofi.urlValidation')
					: null,
			successMessage: t('admin.config.kofi.saveSuccess'),
		},
	);

	// Column definitions live in the component so their titles can be translated.
	const effectCommandColumns = [
		{
			title: t('admin.config.kofi.columnCommand'),
			dataIndex: 'command',
			key: 'command',
			render: (command: string) => <Text code>{command}</Text>,
		},
		{ title: t('admin.config.kofi.columnEffect'), dataIndex: 'name', key: 'name' },
		{ title: t('admin.config.kofi.columnPriceJpy'), dataIndex: 'priceJpy', key: 'priceJpy' },
		{ title: t('admin.config.kofi.columnPriceUsd'), dataIndex: 'priceUsd', key: 'priceUsd' },
	];

	// Generate webhook URL for Ko-fi settings
	const webhookUrl =
		typeof window !== 'undefined'
			? `${window.location.origin}/api/kofi/webhook`
			: `${NEXT_PUBLIC_API_HOST}api/kofi/webhook`;

	const copyToClipboard = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		message.success(t('admin.config.kofi.copySuccess', { label }));
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.kofi.title')}
				description={t('admin.config.kofi.intro')}
			/>

			<SetupGuide
				steps={[
					<>
						<a href="https://ko-fi.com/" target="_blank" rel="noopener noreferrer">
							Ko-fi
						</a>
						{t('admin.config.kofi.step1Suffix')}
					</>,
					<>
						<a href="https://ko-fi.com/settings" target="_blank" rel="noopener noreferrer">
							{t('admin.config.kofi.step2LinkText')}
						</a>
						{t('admin.config.kofi.step2Suffix')}
					</>,
					<>
						<a href="https://ko-fi.com/manage/webhooks" target="_blank" rel="noopener noreferrer">
							{t('admin.config.kofi.webhookSettingsPage')}
						</a>
						{t('admin.config.kofi.step3Suffix')}
					</>,
					t('admin.config.kofi.step4'),
					t('admin.config.kofi.step5'),
					t('admin.config.kofi.step6'),
					t('admin.config.kofi.step7'),
				]}
				footer={
					<Alert
						message={t('admin.config.kofi.realtimeTitle')}
						description={t('admin.config.kofi.realtimeBody')}
						type="success"
						showIcon
					/>
				}
			/>

			<Alert
				message={t('admin.config.kofi.aboutTitle')}
				description={
					<span>
						{t('admin.config.kofi.aboutBody1')}
						<a href="https://ko-fi.com/" target="_blank" rel="noopener noreferrer">
							{' '}
							{t('admin.config.kofi.aboutLinkText')}{' '}
						</a>
						{t('admin.config.kofi.aboutBody2')}
					</span>
				}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField
					label={t('admin.config.kofi.enableLabel')}
					description={t('admin.config.kofi.enableDescription')}
				>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.kofi.webhookCardTitle')}>
				<Alert
					message={t('admin.config.kofi.webhookAlertTitle')}
					description={
						<div>
							<p>
								{t('admin.config.kofi.webhookAlertPrefix')}
								<a
									href="https://ko-fi.com/manage/webhooks"
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('admin.config.kofi.webhookSettingsPage')}
								</a>
								{t('admin.config.kofi.webhookAlertSuffix')}
							</p>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
								<Input value={webhookUrl} readOnly style={{ flex: 1 }} />
								<Tooltip title={t('admin.config.kofi.copyUrlTooltip')}>
									<Button
										icon={<CopyOutlined />}
										onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
									/>
								</Tooltip>
							</div>
						</div>
					}
					type="warning"
					showIcon
					style={{ marginBottom: 16 }}
				/>

				<FormField
					label={
						<>
							Verification Token{' '}
							<Tooltip title={t('admin.config.kofi.verificationTokenTooltip')}>
								<InfoCircleOutlined />
							</Tooltip>
						</>
					}
					description={t('admin.config.kofi.verificationTokenDescription')}
				>
					<Input.Password
						value={config.verificationToken}
						onChange={e => update({ verificationToken: e.target.value })}
						placeholder={t('admin.config.kofi.verificationTokenPlaceholder')}
						style={{ marginTop: 8 }}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.kofi.pageSettingsTitle')}>
				<FormField
					label={t('admin.config.kofi.pageUrlLabel')}
					description={t('admin.config.kofi.pageUrlDescription')}
				>
					<Input
						value={config.pageUrl}
						onChange={e => update({ pageUrl: e.target.value })}
						placeholder="https://ko-fi.com/your-username"
						style={{ marginTop: 8 }}
					/>
				</FormField>

				<FormField
					label={t('admin.config.shared.displayNameOptional')}
					description={t('admin.config.shared.displayNameDescription', { name: 'Ko-fi' })}
				>
					<Input
						value={config.displayName}
						onChange={e => update({ displayName: e.target.value })}
						placeholder="Ko-fi"
						style={{ marginTop: 8 }}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.kofi.effectsCardTitle')}>
				<Space direction="vertical" style={{ width: '100%' }}>
					<Paragraph style={{ marginBottom: 0 }}>{t('admin.config.kofi.effectsIntro')}</Paragraph>
					<Table
						dataSource={EFFECT_COMMAND_ROWS}
						columns={effectCommandColumns}
						pagination={false}
						size="small"
					/>
					<Text type="secondary">{t('admin.config.kofi.effectsExample')}</Text>
				</Space>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

KofiConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default KofiConfigPage;
