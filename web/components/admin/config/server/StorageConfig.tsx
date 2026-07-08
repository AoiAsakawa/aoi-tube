import React from 'react';
import { useTranslation } from 'react-i18next';
import EditStorage from './EditStorage';

export default function ConfigStorageInfo() {
	const { t } = useTranslation();

	return (
		<>
			<p className="description">
				{t('admin.sections.storage.intro.beforeLink')}{' '}
				<a
					href="https://owncast.online/docs/storage/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.sections.storage.intro.linkText')}
				</a>
				.
			</p>
			<p className="description">{t('admin.sections.storage.warning')}</p>
			<p className="description">{t('admin.sections.storage.liveOnly')}</p>
			<EditStorage />
		</>
	);
}
