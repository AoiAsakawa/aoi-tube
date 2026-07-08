import { Typography, Switch, Input, Alert, Space } from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_PAYPAL_CONFIG, ADMIN_PAYPAL_CONFIG_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { CredentialTabs } from '../../components/admin/CredentialTabs';
import { CurrencySelect } from '../../components/admin/CurrencySelect';
import { EnvironmentModeField } from '../../components/admin/EnvironmentModeField';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';
import { SetupGuide } from '../../components/admin/SetupGuide';
import { WebhookUrlField } from '../../components/admin/WebhookUrlField';

const { Text } = Typography;

interface PayPalConfig {
	enabled: boolean;
	isSandbox: boolean;
	currencyCode: string;
	merchantId: string;
	// Sandbox credentials
	sandboxClientId: string;
	sandboxClientSecret: string;
	// Production credentials
	productionClientId: string;
	productionClientSecret: string;
	// Legacy fields (for backward compatibility)
	clientId?: string;
	clientSecret?: string;
}

// Currency codes offered by the PayPal integration, in display order.
// Option data comes from the shared canonical list in utils/currency-constants.
const PAYPAL_CURRENCIES = [
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'JPY',
	'CNY',
	'HKD',
	'SGD',
	'TWD',
	'KRW',
	'THB',
	'PHP',
	'MYR',
	'INR',
	'BRL',
	'MXN',
];

const PayPalConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<PayPalConfig>(
		ADMIN_PAYPAL_CONFIG,
		ADMIN_PAYPAL_CONFIG_SET,
		{
			enabled: false,
			isSandbox: true,
			currencyCode: 'USD',
			merchantId: '',
			sandboxClientId: '',
			sandboxClientSecret: '',
			productionClientId: '',
			productionClientSecret: '',
		},
		{
			// Handle migration from legacy fields
			fromResponse: raw => {
				const data = raw as PayPalConfig;
				return {
					...data,
					sandboxClientId: data.sandboxClientId || (data.isSandbox ? data.clientId : '') || '',
					sandboxClientSecret:
						data.sandboxClientSecret || (data.isSandbox ? data.clientSecret : '') || '',
					productionClientId:
						data.productionClientId || (!data.isSandbox ? data.clientId : '') || '',
					productionClientSecret:
						data.productionClientSecret || (!data.isSandbox ? data.clientSecret : '') || '',
				};
			},
			successMessage: t('admin.config.paypal.saveSuccess'),
		},
	);

	// Check if current environment has credentials configured
	const hasCurrentEnvCredentials = () => {
		if (config.isSandbox) {
			return config.sandboxClientId && config.sandboxClientSecret;
		}
		return config.productionClientId && config.productionClientSecret;
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.paypal.title')}
				description={t('admin.config.paypal.intro')}
			/>

			<SetupGuide
				steps={[
					<>
						<a href="https://developer.paypal.com/" target="_blank" rel="noopener noreferrer">
							PayPal Developer Portal
						</a>
						{t('admin.config.paypal.step1Suffix')}
					</>,
					t('admin.config.paypal.step2'),
					<>
						<strong>{t('admin.config.paypal.step3Strong')}</strong>
						{t('admin.config.paypal.step3Body')}
					</>,
					<>
						<strong>{t('admin.config.paypal.step4Strong')}</strong>
						{t('admin.config.paypal.step4Body')}
					</>,
					t('admin.config.paypal.step5'),
					t('admin.config.paypal.step6'),
					t('admin.config.paypal.step7'),
				]}
				footer={
					<Alert
						message={t('admin.config.paypal.sandboxTestAlertTitle')}
						description={
							<span>
								{t('admin.config.paypal.sandboxTestBody1')}
								<a
									href="https://developer.paypal.com/tools/sandbox/accounts/"
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('admin.config.paypal.sandboxTestLinkText')}
								</a>
								{t('admin.config.paypal.sandboxTestBody2')}
							</span>
						}
						type="info"
						showIcon
					/>
				}
			/>

			<Alert
				message={t('admin.config.paypal.aboutTitle')}
				description={
					<span>
						{t('admin.config.paypal.aboutBody1')}
						<a href="https://developer.paypal.com/" target="_blank" rel="noopener noreferrer">
							{' '}
							PayPal Developer Portal{' '}
						</a>
						{t('admin.config.paypal.aboutBody2')}
					</span>
				}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField label={t('admin.config.paypal.enableLabel')}>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
					{config.enabled && !hasCurrentEnvCredentials() && (
						<Alert
							message={t('admin.config.shared.credentialsMissing')}
							description={t('admin.config.paypal.credentialsMissingBody', {
								env: config.isSandbox
									? t('admin.config.paypal.envSandbox')
									: t('admin.config.paypal.envProduction'),
							})}
							type="warning"
							showIcon
							style={{ marginTop: 8 }}
						/>
					)}
				</FormField>

				<FormField
					label={t('admin.config.shared.environmentMode')}
					description={t('admin.config.shared.sandboxTestFirst')}
				>
					<EnvironmentModeField
						checked={config.isSandbox}
						onChange={checked => update({ isSandbox: checked })}
						checkedLabel={t('admin.config.paypal.envSandbox')}
						uncheckedLabel={t('admin.config.paypal.envProduction')}
						modeNote={
							config.isSandbox
								? t('admin.config.paypal.modeSandboxNote')
								: t('admin.config.paypal.modeProductionNote')
						}
					/>
				</FormField>

				<FormField label={t('admin.config.shared.currency')}>
					<CurrencySelect
						value={config.currencyCode}
						onChange={value => update({ currencyCode: value })}
						currencies={PAYPAL_CURRENCIES}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.shared.apiCredentials')}>
				<Alert
					message={t('admin.config.paypal.separateCredsTitle')}
					description={t('admin.config.paypal.separateCredsBody')}
					type="info"
					showIcon
					style={{ marginBottom: 16 }}
				/>

				<CredentialTabs
					defaultActiveKey={config.isSandbox ? 'sandbox' : 'production'}
					tabs={[
						{
							key: 'sandbox',
							label: t('admin.config.paypal.sandboxTabLabel'),
							configured: Boolean(config.sandboxClientId && config.sandboxClientSecret),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.paypal.sandboxEnvAlertTitle')}
										description={t('admin.config.paypal.sandboxEnvAlertBody')}
										type="info"
										showIcon
									/>
									<FormField
										label="Sandbox Client ID"
										description={t('admin.config.paypal.sandboxClientIdDescription')}
									>
										<Input
											value={config.sandboxClientId}
											onChange={e => update({ sandboxClientId: e.target.value })}
											placeholder={t('admin.config.paypal.clientIdPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label="Sandbox Client Secret"
										description={t('admin.config.paypal.sandboxClientSecretDescription')}
									>
										<Input.Password
											value={config.sandboxClientSecret}
											onChange={e => update({ sandboxClientSecret: e.target.value })}
											placeholder={t('admin.config.paypal.sandboxClientSecretPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>
								</Space>
							),
						},
						{
							key: 'production',
							label: t('admin.config.paypal.productionTabLabel'),
							configured: Boolean(config.productionClientId && config.productionClientSecret),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.paypal.productionEnvAlertTitle')}
										description={t('admin.config.paypal.productionEnvAlertBody')}
										type="warning"
										showIcon
									/>
									<FormField
										label="Live Client ID"
										description={t('admin.config.paypal.liveClientIdDescription')}
									>
										<Input
											value={config.productionClientId}
											onChange={e => update({ productionClientId: e.target.value })}
											placeholder={t('admin.config.paypal.clientIdPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label="Live Client Secret"
										description={t('admin.config.paypal.liveClientSecretDescription')}
									>
										<Input.Password
											value={config.productionClientSecret}
											onChange={e => update({ productionClientSecret: e.target.value })}
											placeholder={t('admin.config.paypal.liveClientSecretPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>
								</Space>
							),
						},
					]}
				/>

				<div style={{ marginTop: 24 }}>
					<FormField
						label={t('admin.config.paypal.merchantIdLabel')}
						description={t('admin.config.paypal.merchantIdDescription')}
					>
						<Input
							value={config.merchantId}
							onChange={e => update({ merchantId: e.target.value })}
							placeholder={t('admin.config.paypal.merchantIdPlaceholder')}
							style={{ marginTop: 8 }}
						/>
					</FormField>
				</div>
			</SettingsCard>

			<SettingsCard title={t('admin.config.shared.webhookEndpoint')}>
				<WebhookUrlField path="/api/paypal/webhook" />
				<div style={{ marginTop: 8 }}>
					<Text type="secondary">{t('admin.config.paypal.webhookEventNote')}</Text>
				</div>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

PayPalConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default PayPalConfigPage;
