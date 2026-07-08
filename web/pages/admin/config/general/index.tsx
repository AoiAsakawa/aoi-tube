import React, { ReactElement } from 'react';
import { Tabs } from 'antd';
import { useTranslation } from 'react-i18next';

import GeneralConfig from '../../../../components/admin/config/general/GeneralConfig';
import AppearanceConfig from '../../../../components/admin/config/general/AppearanceConfig';

import { AdminLayout } from '../../../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../../../components/admin/AdminPageHeader';
import { EditCustomJavascript } from '../../../../components/admin/EditCustomJavascript';

export default function PublicFacingDetails() {
	const { t } = useTranslation();
	return (
		<div className="config-public-details-page">
			{/* Constant page heading above the tabs so the h1 does not change
			    when switching tabs. Reuses the sidebar menu label. */}
			<AdminPageHeader title={t('admin.layout.mainLayout.menu.generalSettings')} />
			<Tabs
				defaultActiveKey="1"
				centered
				items={[
					{
						label: t('admin.pages.configGeneral.tabs.general'),
						key: '1',
						children: <GeneralConfig />,
					},
					{
						label: t('admin.pages.configGeneral.tabs.customCss'),
						key: '2',
						children: <AppearanceConfig />,
					},
					{
						label: t('admin.pages.configGeneral.tabs.customScripts'),
						key: '3',
						children: <EditCustomJavascript />,
					},
				]}
			/>
		</div>
	);
}

PublicFacingDetails.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
