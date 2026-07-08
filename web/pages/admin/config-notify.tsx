import { Alert, Button, Col, Row } from 'antd';
import React, { ReactElement, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from '@components/compat/Link';

import { DiscordNotify as Discord } from '../../components/admin/notification/discord';
import { BrowserNotify as Browser } from '../../components/admin/notification/browser';
import { TwitterNotify as Twitter } from '../../components/admin/notification/twitter';
import { FederationConfigSection } from '../../components/admin/config/FederationConfigSection';
import { EditNotificationThumbnail } from '../../components/admin/EditNotificationThumbnail';
import {
	TextFieldWithSubmit,
	TEXTFIELD_TYPE_URL,
} from '../../components/admin/TextFieldWithSubmit';
import { ToggleSwitch } from '../../components/admin/ToggleSwitch';
import {
	TEXTFIELD_PROPS_FEDERATION_INSTANCE_URL,
	FIELD_PROPS_SILENT_STREAM_MODE,
} from '../../utils/config-constants';
import { ServerStatusContext } from '../../utils/server-status-context';
import { UpdateArgs } from '../../types/config-section';
import { isValidUrl } from '../../utils/validators';

import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { SettingsCard } from '../../components/admin/SettingsCard';

export default function ConfigNotify() {
	const { t } = useTranslation();
	const [formDataValues, setFormDataValues] = useState(null);
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const { yp, silentStreamMode } = serverConfig;
	const { instanceUrl } = yp;
	const [urlValid, setUrlValid] = useState(false);

	useEffect(() => {
		setFormDataValues({
			instanceUrl,
		});
	}, [yp]);

	const handleSubmitInstanceUrl = () => {
		if (!urlValid) {
			return;
		}

		setFormDataValues({
			...formDataValues,
			enabled: false,
		});
	};

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setUrlValid(isValidUrl(value));

		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	const enabled = instanceUrl !== '';
	const configurationWarning = !enabled && (
		<>
			<Alert message={t('admin.config.notify.instanceUrlRequired')} type="warning" showIcon />
			<br />
			<TextFieldWithSubmit
				fieldName="instanceUrl"
				{...TEXTFIELD_PROPS_FEDERATION_INSTANCE_URL}
				value={formDataValues?.instanceUrl || ''}
				initialValue={yp.instanceUrl}
				type={TEXTFIELD_TYPE_URL}
				onChange={handleFieldChange}
				onSubmit={handleSubmitInstanceUrl}
				required
			/>
		</>
	);

	return (
		<>
			<AdminPageHeader title={t('admin.config.notify.title')} />
			<p className="description">
				{t('admin.config.notify.description')}{' '}
				<a
					href="https://owncast.online/docs/notifications/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.config.notify.learnMore')}
				</a>
			</p>

			{configurationWarning}

			<Row gutter={[24, 24]}>
				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.config.notify.silentModeTitle')}>
						<p className="description">{t('admin.config.notify.silentModeDescription')}</p>
						<ToggleSwitch
							fieldName="silentStreamMode"
							{...FIELD_PROPS_SILENT_STREAM_MODE}
							checked={silentStreamMode}
						/>
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.config.notify.thumbnailTitle')}>
						<EditNotificationThumbnail />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.sections.browserNotify.title')}>
						<Browser />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.sections.discordNotify.title')}>
						<Discord />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.sections.twitterNotify.title')}>
						<Twitter />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.sections.federation.title')}>
						<FederationConfigSection />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard title={t('admin.config.notify.customTitle')}>
						<p className="description">{t('admin.config.notify.customDescription')}</p>

						<Link passHref href="/admin/webhooks">
							<Button type="primary">{t('admin.config.notify.createButton')}</Button>
						</Link>
					</SettingsCard>
				</Col>
			</Row>
		</>
	);
}

ConfigNotify.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
