import { Popconfirm, Button, Typography } from 'antd';
import { FC, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertMessageContext } from '../../utils/alert-message-context';

import { API_YP_RESET, fetchData } from '../../utils/apis';
import { RESET_TIMEOUT } from '../../utils/config-constants';
import {
	createInputStatus,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { FormStatusIndicator } from './FormStatusIndicator';

export const ResetYP: FC = () => {
	const { t } = useTranslation();
	const { setMessage } = useContext(AlertMessageContext);

	const [submitStatus, setSubmitStatus] = useState(null);
	let resetTimer = null;
	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	const resetDirectoryRegistration = async () => {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		try {
			await fetchData(API_YP_RESET);
			setMessage('');
			setSubmitStatus(createInputStatus(STATUS_SUCCESS));
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
		} catch (error) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: String(error) })),
			);
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
		}
	};

	return (
		<>
			<Typography.Title level={3} className="section-title">
				{t('admin.layout.resetYP.title')}
			</Typography.Title>
			<p className="description">{t('admin.layout.resetYP.desc')}</p>

			<Popconfirm
				placement="topLeft"
				title={t('admin.layout.resetYP.confirm')}
				onConfirm={resetDirectoryRegistration}
				okText={t('admin.layout.common.yes')}
				cancelText={t('admin.layout.common.no')}
			>
				<Button type="primary">{t('admin.layout.resetYP.resetButton')}</Button>
			</Popconfirm>
			<p>
				<FormStatusIndicator status={submitStatus} />
			</p>
		</>
	);
};
