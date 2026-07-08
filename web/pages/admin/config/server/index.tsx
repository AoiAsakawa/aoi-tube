import React, { ReactElement, useContext } from 'react';
import { Tabs } from 'antd';
import { useTranslation } from 'react-i18next';

import StreamKeys from '../../../../components/admin/config/server/StreamKeys';
import ServerConfig from '../../../../components/admin/config/server/ServerConfig';
import StorageConfig from '../../../../components/admin/config/server/StorageConfig';
import BackupConfig from '../../../../components/admin/config/server/BackupConfig';
import RTMPSConfig from '../../../../components/admin/config/server/RTMPSConfig';
import { ServerStatusContext } from '../../../../utils/server-status-context';

import { AdminLayout } from '../../../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../../../components/admin/AdminPageHeader';

export default function PublicFacingDetails() {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);

	const { serverConfig } = serverStatusData || {};
	const { streamKeyOverridden } = serverConfig || {};

	const tabItems = [
		{
			label: t('admin.pages.configServer.tabs.server'),
			key: '1',
			children: (
				<>
					<ServerConfig />
					<RTMPSConfig />
				</>
			),
		},
		{
			label: t('admin.pages.configServer.tabs.storage'),
			key: '3',
			children: <StorageConfig />,
		},
		{
			label: t('admin.pages.configServer.tabs.backup'),
			key: '4',
			children: <BackupConfig />,
		},
	];

	// Only show when the stream key is not overridden
	if (!streamKeyOverridden) {
		tabItems.splice(1, 0, {
			label: t('admin.pages.configServer.tabs.streamKeys'),
			key: '2',
			children: <StreamKeys />,
		});
	}

	return (
		<div className="config-public-details-page">
			{/* Constant page heading above the tabs so the h1 does not change
			    when switching tabs. Reuses the sidebar menu label. */}
			<AdminPageHeader title={t('admin.layout.mainLayout.menu.serverSettings')} />
			<Tabs defaultActiveKey="1" centered items={tabItems} />
		</div>
	);
}

PublicFacingDetails.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
