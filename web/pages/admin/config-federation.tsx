import { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { FederationConfigSection } from '../../components/admin/config/FederationConfigSection';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { SettingsCard } from '../../components/admin/SettingsCard';

// Dedicated Fediverse settings page. The section used to live as one card
// inside the notifications page (this route was a redirect there), which left
// the feature without a menu entry of its own.
export default function ConfigFederation() {
	const { t } = useTranslation();

	return (
		<>
			<AdminPageHeader title={t('admin.layout.mainLayout.menu.federationSettings')} />
			<SettingsCard title={t('admin.sections.federation.title')}>
				<FederationConfigSection />
			</SettingsCard>
		</>
	);
}

ConfigFederation.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
