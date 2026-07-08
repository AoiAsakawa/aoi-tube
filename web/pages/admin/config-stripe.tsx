import { Typography, Switch, Input, Alert, Space } from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_STRIPE_CONFIG, ADMIN_STRIPE_CONFIG_SET } from '../../utils/apis';
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

interface StripeConfig {
	enabled: boolean;
	isTestMode: boolean;
	currencyCode: string;
	// Test credentials
	testPublishableKey: string;
	testSecretKey: string;
	testWebhookSecret: string;
	// Live credentials
	livePublishableKey: string;
	liveSecretKey: string;
	liveWebhookSecret: string;
}

// Currency codes offered by the Stripe integration, in display order.
// Option data comes from the shared canonical list in utils/currency-constants.
const STRIPE_CURRENCIES = [
	'JPY',
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'CHF',
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
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'CZK',
	'NZD',
];

const DEFAULT_STRIPE_CONFIG: StripeConfig = {
	enabled: false,
	isTestMode: true,
	currencyCode: 'JPY',
	testPublishableKey: '',
	testSecretKey: '',
	testWebhookSecret: '',
	livePublishableKey: '',
	liveSecretKey: '',
	liveWebhookSecret: '',
};

const StripeConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<StripeConfig>(
		ADMIN_STRIPE_CONFIG,
		ADMIN_STRIPE_CONFIG_SET,
		DEFAULT_STRIPE_CONFIG,
		{
			// Merge over defaults so fields missing from the response keep their initial values
			fromResponse: raw => ({ ...DEFAULT_STRIPE_CONFIG, ...(raw as Partial<StripeConfig>) }),
			successMessage: t('admin.config.stripe.saveSuccess'),
		},
	);

	// Check if current environment has credentials configured
	const hasCurrentEnvCredentials = () => {
		if (config.isTestMode) {
			return config.testPublishableKey && config.testSecretKey;
		}
		return config.livePublishableKey && config.liveSecretKey;
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.stripe.title')}
				description={t('admin.config.stripe.intro')}
			/>

			<SetupGuide
				steps={[
					<>
						<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">
							Stripe Dashboard
						</a>
						{t('admin.config.stripe.step1Suffix')}
					</>,
					t('admin.config.stripe.step2'),
					<>
						<strong>{t('admin.config.stripe.step3Strong')}</strong>
						{t('admin.config.stripe.step3Body')}
					</>,
					<>
						<strong>{t('admin.config.stripe.step4Strong')}</strong>
						{t('admin.config.stripe.step4Body')}
					</>,
					t('admin.config.stripe.step5'),
					t('admin.config.stripe.step6'),
					t('admin.config.stripe.step7'),
				]}
				footer={
					<Alert
						message={t('admin.config.stripe.testCardAlertTitle')}
						description={
							<span>
								{t('admin.config.stripe.testCardIntro')}
								<br />• <code>4242 4242 4242 4242</code> -{' '}
								{t('admin.config.stripe.testCardSuccess')}
								<br />• <code>4000 0000 0000 0002</code> -{' '}
								{t('admin.config.stripe.testCardFailure')}
								<br />
								{t('admin.config.stripe.testCardNote')}
							</span>
						}
						type="info"
						showIcon
					/>
				}
			/>

			<Alert
				message={t('admin.config.stripe.aboutTitle')}
				description={
					<span>
						{t('admin.config.stripe.aboutBody1')}
						<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">
							{' '}
							Stripe Dashboard{' '}
						</a>
						{t('admin.config.stripe.aboutBody2')}
					</span>
				}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField label={t('admin.config.stripe.enableLabel')}>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
					{config.enabled && !hasCurrentEnvCredentials() && (
						<Alert
							message={t('admin.config.shared.credentialsMissing')}
							description={t('admin.config.stripe.credentialsMissingBody', {
								env: config.isTestMode
									? t('admin.config.stripe.envTest')
									: t('admin.config.stripe.envProduction'),
							})}
							type="warning"
							showIcon
							style={{ marginTop: 8 }}
						/>
					)}
				</FormField>

				<FormField
					label={t('admin.config.shared.environmentMode')}
					description={t('admin.config.stripe.testModeFirst')}
				>
					<EnvironmentModeField
						checked={config.isTestMode}
						onChange={checked => update({ isTestMode: checked })}
						checkedLabel={t('admin.config.stripe.envTest')}
						uncheckedLabel={t('admin.config.stripe.envProduction')}
						modeNote={
							config.isTestMode
								? t('admin.config.stripe.modeTestNote')
								: t('admin.config.stripe.modeProductionNote')
						}
					/>
				</FormField>

				<FormField label={t('admin.config.shared.currency')}>
					<CurrencySelect
						value={config.currencyCode}
						onChange={value => update({ currencyCode: value })}
						currencies={STRIPE_CURRENCIES}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.stripe.apiKeysTitle')}>
				<Alert
					message={t('admin.config.stripe.separateKeysTitle')}
					description={t('admin.config.stripe.separateKeysBody')}
					type="info"
					showIcon
					style={{ marginBottom: 16 }}
				/>

				<CredentialTabs
					defaultActiveKey={config.isTestMode ? 'test' : 'live'}
					tabs={[
						{
							key: 'test',
							label: t('admin.config.stripe.testTabLabel'),
							configured: Boolean(config.testPublishableKey && config.testSecretKey),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.stripe.testModeAlertTitle')}
										description={t('admin.config.stripe.testModeAlertBody')}
										type="info"
										showIcon
									/>
									<FormField
										label="Test Publishable Key"
										description={t('admin.config.stripe.testPublishableKeyDescription')}
									>
										<Input
											value={config.testPublishableKey}
											onChange={e => update({ testPublishableKey: e.target.value })}
											placeholder="pk_test_..."
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label="Test Secret Key"
										description={t('admin.config.stripe.testSecretKeyDescription')}
									>
										<Input.Password
											value={config.testSecretKey}
											onChange={e => update({ testSecretKey: e.target.value })}
											placeholder="sk_test_..."
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label={t('admin.config.stripe.testWebhookSecretLabel')}
										description={t('admin.config.stripe.webhookSecretDescription')}
									>
										<Input.Password
											value={config.testWebhookSecret}
											onChange={e => update({ testWebhookSecret: e.target.value })}
											placeholder="whsec_..."
											style={{ marginTop: 8 }}
										/>
									</FormField>
								</Space>
							),
						},
						{
							key: 'live',
							label: t('admin.config.stripe.liveTabLabel'),
							configured: Boolean(config.livePublishableKey && config.liveSecretKey),
							children: (
								<Space direction="vertical" style={{ width: '100%' }} size="large">
									<Alert
										message={t('admin.config.stripe.liveModeAlertTitle')}
										description={t('admin.config.stripe.liveModeAlertBody')}
										type="warning"
										showIcon
									/>
									<FormField
										label="Live Publishable Key"
										description={t('admin.config.stripe.livePublishableKeyDescription')}
									>
										<Input
											value={config.livePublishableKey}
											onChange={e => update({ livePublishableKey: e.target.value })}
											placeholder="pk_live_..."
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label="Live Secret Key"
										description={t('admin.config.stripe.liveSecretKeyDescription')}
									>
										<Input.Password
											value={config.liveSecretKey}
											onChange={e => update({ liveSecretKey: e.target.value })}
											placeholder="sk_live_..."
											style={{ marginTop: 8 }}
										/>
									</FormField>

									<FormField
										label={t('admin.config.stripe.liveWebhookSecretLabel')}
										description={t('admin.config.stripe.webhookSecretDescription')}
									>
										<Input.Password
											value={config.liveWebhookSecret}
											onChange={e => update({ liveWebhookSecret: e.target.value })}
											placeholder="whsec_..."
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
				<WebhookUrlField path="/api/stripe/webhook" />
				<div style={{ marginTop: 8 }}>
					<Text type="secondary">{t('admin.config.stripe.webhookEventNote')}</Text>
				</div>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

StripeConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default StripeConfigPage;
