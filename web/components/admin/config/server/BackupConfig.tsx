import { Col, Row, Typography } from 'antd';
import { FC, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '../../ToggleSwitch';
import { TextFieldWithSubmit } from '../../TextFieldWithSubmit';
import { TEXTFIELD_TYPE_NUMBER } from '../../TextField';
import { ServerStatusContext } from '../../../../utils/server-status-context';
import {
	FIELD_PROPS_BACKUP_ENABLED,
	FIELD_PROPS_BACKUP_STORE_S3,
	TEXTFIELD_PROPS_BACKUP_INTERVAL,
	TEXTFIELD_PROPS_BACKUP_RETENTION,
} from '../../../../utils/config-constants';

const { Title } = Typography;

// Scheduled database backups: the DB holds config, users, donations and
// purchase entitlements, so its loss actually costs the operator money.
const BackupConfig: FC = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const { backupEnabled, backupStoreOnS3, backupIntervalHours, backupRetentionCount } =
		serverConfig;

	// TextFieldWithSubmit is controlled; own the edited values locally.
	const [intervalValue, setIntervalValue] = useState(String(backupIntervalHours ?? 24));
	const [retentionValue, setRetentionValue] = useState(String(backupRetentionCount ?? 7));

	useEffect(() => {
		setIntervalValue(String(backupIntervalHours ?? 24));
	}, [backupIntervalHours]);
	useEffect(() => {
		setRetentionValue(String(backupRetentionCount ?? 7));
	}, [backupRetentionCount]);

	return (
		<div className="config-backup">
			<Title level={3}>{t('admin.config.backup.title')}</Title>
			<p className="description">{t('admin.config.backup.description')}</p>

			<Row>
				<Col span={20} className="form-module" style={{ margin: '5px' }}>
					<ToggleSwitch
						fieldName="backupEnabled"
						{...FIELD_PROPS_BACKUP_ENABLED}
						checked={backupEnabled}
					/>
					<TextFieldWithSubmit
						fieldName="backupIntervalHours"
						{...TEXTFIELD_PROPS_BACKUP_INTERVAL}
						type={TEXTFIELD_TYPE_NUMBER}
						value={intervalValue}
						initialValue={String(backupIntervalHours ?? 24)}
						onChange={({ value }) => setIntervalValue(String(value))}
					/>
					<TextFieldWithSubmit
						fieldName="backupRetentionCount"
						{...TEXTFIELD_PROPS_BACKUP_RETENTION}
						type={TEXTFIELD_TYPE_NUMBER}
						value={retentionValue}
						initialValue={String(backupRetentionCount ?? 7)}
						onChange={({ value }) => setRetentionValue(String(value))}
					/>
					<ToggleSwitch
						fieldName="backupStoreOnS3"
						{...FIELD_PROPS_BACKUP_STORE_S3}
						checked={backupStoreOnS3}
					/>
				</Col>
			</Row>
		</div>
	);
};

export default BackupConfig;
