import { Typography, Switch, Input, Alert, Space } from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_DONERU_CONFIG, ADMIN_DONERU_CONFIG_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';

const { Paragraph } = Typography;

interface DoneruConfig {
	enabled: boolean;
	creatorUrl: string;
	displayName: string;
}

const DoneruConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<DoneruConfig>(
		ADMIN_DONERU_CONFIG,
		ADMIN_DONERU_CONFIG_SET,
		{ enabled: false, creatorUrl: '', displayName: '' },
		{
			validate: c =>
				c.creatorUrl && !c.creatorUrl.startsWith('https://doneru.jp/')
					? t('admin.config.doneru.urlValidation')
					: null,
			successMessage: t('admin.config.doneru.saveSuccess'),
		},
	);

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.doneru.title')}
				description={t('admin.config.doneru.intro')}
			/>

			<Alert
				message={t('admin.config.doneru.aboutTitle')}
				description={
					<span>
						{t('admin.config.doneru.aboutBody1')}
						<a href="https://doneru.jp/" target="_blank" rel="noopener noreferrer">
							{' '}
							{t('admin.config.doneru.aboutLinkText')}{' '}
						</a>
						{t('admin.config.doneru.aboutBody2')}
					</span>
				}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField
					label={t('admin.config.doneru.enableLabel')}
					description={t('admin.config.doneru.enableDescription')}
				>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.doneru.creatorSettingsTitle')}>
				<FormField
					label={t('admin.config.doneru.creatorUrlLabel')}
					description={t('admin.config.doneru.creatorUrlDescription')}
				>
					<Input
						value={config.creatorUrl}
						onChange={e => update({ creatorUrl: e.target.value })}
						placeholder="https://doneru.jp/your-username"
						style={{ marginTop: 8 }}
					/>
				</FormField>

				<FormField
					label={t('admin.config.shared.displayNameOptional')}
					description={t('admin.config.shared.displayNameDescription', { name: 'Doneru' })}
				>
					<Input
						value={config.displayName}
						onChange={e => update({ displayName: e.target.value })}
						placeholder="Doneru"
						style={{ marginTop: 8 }}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.doneru.howToTitle')}>
				<Space direction="vertical" style={{ width: '100%' }}>
					<Paragraph>
						<ol>
							<li>
								<a href="https://doneru.jp/" target="_blank" rel="noopener noreferrer">
									Doneru
								</a>
								{t('admin.config.doneru.step1Suffix')}
							</li>
							<li>{t('admin.config.doneru.step2')}</li>
							<li>{t('admin.config.doneru.step3')}</li>
							<li>{t('admin.config.doneru.step4')}</li>
							<li>{t('admin.config.doneru.step5')}</li>
						</ol>
					</Paragraph>
					<Alert
						message={t('admin.config.doneru.noteTitle')}
						description={t('admin.config.doneru.noteBody')}
						type="warning"
						showIcon
					/>
				</Space>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

DoneruConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default DoneruConfigPage;
