import { Switch, Input, Alert, Space } from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_PAYPAY_CONFIG, ADMIN_PAYPAY_CONFIG_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { CredentialTabs } from '../../components/admin/CredentialTabs';
import { EnvironmentModeField } from '../../components/admin/EnvironmentModeField';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';
import { WebhookUrlField } from '../../components/admin/WebhookUrlField';

interface PayPayConfig {
	enabled: boolean;
	isSandbox: boolean;
	// Sandbox credentials
	sandboxApiKey: string;
	sandboxApiSecret: string;
	sandboxMerchantId: string;
	// Production credentials
	productionApiKey: string;
	productionApiSecret: string;
	productionMerchantId: string;
	// Legacy fields (for backward compatibility)
	apiKey?: string;
	apiSecret?: string;
	merchantId?: string;
}

const PayPayConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<PayPayConfig>(
		ADMIN_PAYPAY_CONFIG,
		ADMIN_PAYPAY_CONFIG_SET,
		{
			enabled: false,
			isSandbox: true,
			sandboxApiKey: '',
			sandboxApiSecret: '',
			sandboxMerchantId: '',
			productionApiKey: '',
			productionApiSecret: '',
			productionMerchantId: '',
		},
		{
			// Handle migration from legacy fields
			fromResponse: raw => {
				const data = raw as PayPayConfig;
				return {
					...data,
					sandboxApiKey: data.sandboxApiKey || (data.isSandbox ? data.apiKey : '') || '',
					sandboxApiSecret: data.sandboxApiSecret || (data.isSandbox ? data.apiSecret : '') || '',
					sandboxMerchantId:
						data.sandboxMerchantId || (data.isSandbox ? data.merchantId : '') || '',
					productionApiKey: data.productionApiKey || (!data.isSandbox ? data.apiKey : '') || '',
					productionApiSecret:
						data.productionApiSecret || (!data.isSandbox ? data.apiSecret : '') || '',
					productionMerchantId:
						data.productionMerchantId || (!data.isSandbox ? data.merchantId : '') || '',
				};
			},
			successMessage: t('admin.config.paypay.saveSuccess'),
		},
	);

	// Check if current environment has credentials configured
	const hasCurrentEnvCredentials = () => {
		if (config.isSandbox) {
			return config.sandboxApiKey && config.sandboxApiSecret;
		}
		return config.productionApiKey && config.productionApiSecret;
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.paypay.title')}
				description={t('admin.config.paypay.intro')}
			/>

			<Alert
				message="PayPay for Developers"
				description={
					<span>
						{t('admin.config.paypay.aboutBody1')}
						<a href="https://developer.paypay.ne.jp/" target="_blank" rel="noopener noreferrer">
							{' '}
							PayPay for Developers{' '}
						</a>
						{t('admin.config.paypay.aboutBody2')}
					</span>
				}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField label={t('admin.config.paypay.enableLabel')}>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
					{config.enabled && !hasCurrentEnvCredentials() && (
						<Alert
							message={t('admin.config.shared.credentialsMissing')}
							description={t('admin.config.paypay.credentialsMissingBody', {
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
						productionWarning={t('admin.config.paypay.productionWarningBody')}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.shared.apiCredentials')}>
				<Alert
					message={t('admin.config.paypal.separateCredsTitle')}
					description={t('admin.config.paypay.separateCredsBody')}
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
							configured: Boolean(config.sandboxApiKey && config.sandboxApiSecret),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.paypal.sandboxEnvAlertTitle')}
										description={t('admin.config.paypal.sandboxEnvAlertBody')}
										type="info"
										showIcon
									/>
									<FormField label={t('admin.config.paypay.apiKeyLabel')}>
										<Input
											value={config.sandboxApiKey}
											onChange={e => update({ sandboxApiKey: e.target.value })}
											placeholder={t('admin.config.paypay.apiKeyPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField label={t('admin.config.paypay.apiSecretLabel')}>
										<Input.Password
											value={config.sandboxApiSecret}
											onChange={e => update({ sandboxApiSecret: e.target.value })}
											placeholder={t('admin.config.paypay.apiSecretPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField label={t('admin.config.paypay.merchantIdLabel')}>
										<Input
											value={config.sandboxMerchantId}
											onChange={e => update({ sandboxMerchantId: e.target.value })}
											placeholder={t('admin.config.paypay.merchantIdPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>
								</Space>
							),
						},
						{
							key: 'production',
							label: t('admin.config.paypal.productionTabLabel'),
							configured: Boolean(config.productionApiKey && config.productionApiSecret),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.paypal.productionEnvAlertTitle')}
										description={t('admin.config.paypal.productionEnvAlertBody')}
										type="warning"
										showIcon
									/>
									<FormField label={t('admin.config.paypay.apiKeyLabel')}>
										<Input
											value={config.productionApiKey}
											onChange={e => update({ productionApiKey: e.target.value })}
											placeholder={t('admin.config.paypay.apiKeyPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField label={t('admin.config.paypay.apiSecretLabel')}>
										<Input.Password
											value={config.productionApiSecret}
											onChange={e => update({ productionApiSecret: e.target.value })}
											placeholder={t('admin.config.paypay.apiSecretPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField label={t('admin.config.paypay.merchantIdLabel')}>
										<Input
											value={config.productionMerchantId}
											onChange={e => update({ productionMerchantId: e.target.value })}
											placeholder={t('admin.config.paypay.merchantIdPlaceholder')}
											style={{ marginTop: 8 }}
										/>
									</FormField>
								</Space>
							),
						},
					]}
				/>
			</SettingsCard>

			<SettingsCard title={t('admin.config.shared.webhookEndpoint')}>
				<WebhookUrlField path="/api/paypay/webhook" />
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

PayPayConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default PayPayConfigPage;
