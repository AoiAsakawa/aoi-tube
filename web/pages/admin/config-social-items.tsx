import React, { ReactElement } from 'react';
import { Typography, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import EditSocialLinks from '../../components/admin/config/general/EditSocialLinks';
import { DiscordAuth } from '../../components/admin/notification/discordAuth';
import { XAuth } from '../../components/admin/notification/xAuth';
import { GoogleAuth } from '../../components/admin/notification/googleAuth';
import { GitHubAuth } from '../../components/admin/notification/githubAuth';

import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { SettingsCard } from '../../components/admin/SettingsCard';

const { Title } = Typography;

export default function ConfigSocialThings() {
	const { t } = useTranslation();

	return (
		<div className="config-social-items">
			<AdminPageHeader title={t('admin.config.socialItems.title')} />

			{/* The social links module renders its own section heading. */}
			<SettingsCard>
				<EditSocialLinks />
			</SettingsCard>

			<Title level={2}>{t('admin.config.socialItems.authTitle')}</Title>
			<p className="description">{t('admin.config.socialItems.authDescription')}</p>

			{/* Each auth provider module renders its own section heading. */}
			<Row gutter={[24, 24]}>
				<Col xs={24} lg={12}>
					<SettingsCard>
						<XAuth />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard>
						<DiscordAuth />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard>
						<GoogleAuth />
					</SettingsCard>
				</Col>

				<Col xs={24} lg={12}>
					<SettingsCard>
						<GitHubAuth />
					</SettingsCard>
				</Col>
			</Row>
		</div>
	);
}

ConfigSocialThings.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
