// EDIT CUSTOM DETAILS ON YOUR PAGE
import React, { useState, useEffect, useContext } from 'react';
import { Typography, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { bbedit } from '@uiw/codemirror-theme-bbedit';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

import { ServerStatusContext } from '../../../../utils/server-status-context';
import { useSiteTheme } from '../../../../utils/useSiteTheme';
import {
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
	API_CUSTOM_CONTENT,
} from '../../../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../../../utils/input-statuses';
import { FormStatusIndicator } from '../../FormStatusIndicator';

const { Title } = Typography;

export default function EditPageContent() {
	const { t } = useTranslation();
	const { theme: siteTheme } = useSiteTheme();
	const [content, setContent] = useState('');
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [hasChanged, setHasChanged] = useState(false);

	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};

	const { instanceDetails } = serverConfig;
	const { extraPageContent: initialContent } = instanceDetails;

	let resetTimer = null;

	function handleEditorChange(text) {
		setContent(text);
		if (text !== initialContent && !hasChanged) {
			setHasChanged(true);
		} else if (text === initialContent && hasChanged) {
			setHasChanged(false);
		}
	}

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
			apiPath: API_CUSTOM_CONTENT,
			data: { value: content },
			onSuccess: (message: string) => {
				setFieldInConfigState({
					fieldName: 'extraPageContent',
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

	return (
		<div className="edit-page-content">
			<Title level={3} className="section-title">
				{t('admin.sections.pageContent.title')}
			</Title>

			<p className="description">
				{t('admin.sections.pageContent.description.beforeLink')}{' '}
				<a
					href="https://www.markdownguide.org/basic-syntax/"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.sections.pageContent.description.linkText')}
				</a>
				{t('admin.sections.pageContent.description.afterLink')}
			</p>

			<CodeMirror
				value={content}
				placeholder={t('admin.sections.pageContent.placeholder')}
				theme={siteTheme === 'dark' ? 'dark' : bbedit}
				height="200px"
				onChange={handleEditorChange}
				extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
			/>

			<br />
			<div className="page-content-actions">
				{hasChanged && (
					<Button type="primary" onClick={handleSave}>
						{t('admin.sections.pageContent.save')}
					</Button>
				)}
				<FormStatusIndicator status={submitStatus} />
			</div>
		</div>
	);
}
