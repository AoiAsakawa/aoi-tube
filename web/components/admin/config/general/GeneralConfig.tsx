import React from 'react';
import { useTranslation } from 'react-i18next';

import EditInstanceDetails from './EditInstanceDetails';
import EditInstanceTags from './EditInstanceTags';
import EditPageContent from './EditPageContent';

export default function PublicFacingDetails() {
	const { t } = useTranslation();

	return (
		<div className="config-public-details-page">
			<p className="description">
				{t('admin.sections.general.description')}{' '}
				<a
					href="https://owncast.online/docs/website/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.sections.general.learnMore')}
				</a>
			</p>

			<div className="top-container">
				<div className="form-module instance-details-container">
					<EditInstanceDetails />
				</div>
			</div>

			<div className="form-module page-content-module">
				<EditPageContent />
			</div>

			<div className="form-module tags-module">
				<EditInstanceTags />
			</div>
		</div>
	);
}
