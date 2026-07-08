import React from 'react';
import { useTranslation } from 'react-i18next';
import EditServerDetails from '../../EditServerDetails';

export default function ConfigServerDetails() {
	const { t } = useTranslation();

	return (
		<div className="config-server-details-form">
			<p className="description">{t('admin.sections.serverConfig.description')}</p>
			<div className="form-module config-server-details-container">
				<EditServerDetails />
			</div>
		</div>
	);
}
