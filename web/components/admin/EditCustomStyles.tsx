// EDIT CUSTOM CSS STYLES
import React, { useState, useEffect, useContext, FC } from 'react';
import { Typography, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { bbedit } from '@uiw/codemirror-theme-bbedit';
import { css } from '@codemirror/lang-css';

import { ServerStatusContext } from '../../utils/server-status-context';
import { useSiteTheme } from '../../utils/useSiteTheme';
import {
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
	API_CUSTOM_CSS_STYLES,
} from '../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { FormStatusIndicator } from './FormStatusIndicator';

const { Title } = Typography;

export const EditCustomStyles: FC = () => {
	const { t } = useTranslation();
	const { theme: siteTheme } = useSiteTheme();
	const [content, setContent] = useState(t('admin.layout.editCustomStyles.placeholder'));
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [hasChanged, setHasChanged] = useState(false);

	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};

	const { instanceDetails } = serverConfig;
	const { customStyles: initialContent } = instanceDetails;

	let resetTimer = null;

	// Clear out any validation states and messaging
	const resetStates = () => {
		setSubmitStatus(null);
		setHasChanged(false);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	// posts all the tags at once as an array obj
	async function handleSave() {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		await postConfigUpdateToAPI({
			apiPath: API_CUSTOM_CSS_STYLES,
			data: { value: content },
			onSuccess: (message: string) => {
				setFieldInConfigState({
					fieldName: 'customStyles',
					value: content,
					path: 'instanceDetails',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, message));
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
			},
		});
		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	}

	useEffect(() => {
		setContent(initialContent);
	}, [instanceDetails]);

	const onCSSValueChange = React.useCallback(value => {
		setContent(value);
		if (value !== initialContent && !hasChanged) {
			setHasChanged(true);
		} else if (value === initialContent && hasChanged) {
			setHasChanged(false);
		}
	}, []);

	return (
		<div className="edit-custom-css">
			<Title level={3} className="section-title">
				{t('admin.layout.editCustomStyles.title')}
			</Title>

			<p className="description">
				{t('admin.layout.editCustomStyles.desc')}{' '}
				<a href="https://owncast.online/docs/website/" rel="noopener noreferrer" target="_blank">
					{t('admin.layout.editCustomStyles.docsLink')}
				</a>
				{t('admin.layout.editCustomStyles.descSuffix')}
			</p>
			<p className="description">{t('admin.layout.editCustomStyles.plainCssNote')}</p>

			<CodeMirror
				value={content}
				placeholder={t('admin.layout.editCustomStyles.placeholder')}
				theme={siteTheme === 'dark' ? 'dark' : bbedit}
				height="200px"
				extensions={[css()]}
				onChange={onCSSValueChange}
			/>

			<br />
			<div className="page-content-actions">
				{hasChanged && (
					<Button type="primary" onClick={handleSave}>
						{t('admin.layout.common.save')}
					</Button>
				)}
				<FormStatusIndicator status={submitStatus} />
			</div>
		</div>
	);
};
