import { Popconfirm, Select, Typography } from 'antd';
import React, { FC, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertMessageContext } from '../../utils/alert-message-context';
import {
	API_VIDEO_CODEC,
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
} from '../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { ServerStatusContext } from '../../utils/server-status-context';
import { FormStatusIndicator } from './FormStatusIndicator';

export type CodecSelectorProps = {};

export const CodecSelector: FC<CodecSelectorProps> = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { videoCodec, supportedCodecs } = serverConfig || {};
	const { Title } = Typography;
	const { Option } = Select;
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const { setMessage } = useContext(AlertMessageContext);
	const [selectedCodec, setSelectedCodec] = useState(videoCodec);
	const [pendingSaveCodec, setPendingSavecodec] = useState(videoCodec);
	const [confirmPopupOpen, setConfirmPopupOpen] = React.useState(false);

	let resetTimer = null;

	useEffect(() => {
		setSelectedCodec(videoCodec);
	}, [videoCodec]);

	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	function handleChange(value) {
		setPendingSavecodec(value);
		setConfirmPopupOpen(true);
	}

	async function save() {
		setSelectedCodec(pendingSaveCodec);
		setPendingSavecodec('');
		setConfirmPopupOpen(false);

		await postConfigUpdateToAPI({
			apiPath: API_VIDEO_CODEC,
			data: { value: pendingSaveCodec },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'videoCodec',
					value: pendingSaveCodec,
					path: 'videoSettings',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.codecSelector.updated')));

				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
				if (serverStatusData.online) {
					setMessage(t('admin.layout.codecSelector.appliesNextStream'));
				}
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));

				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	}

	const items = supportedCodecs.map(codec => {
		let title = codec;
		if (title === 'libx264') {
			title = t('admin.layout.codecSelector.codecDefault');
		} else if (title === 'h264_nvenc') {
			title = t('admin.layout.codecSelector.codecNvidia');
		} else if (title === 'h264_vaapi') {
			title = t('admin.layout.codecSelector.codecVaapi');
		} else if (title === 'h264_qsv') {
			title = 'Intel Quick Sync';
		} else if (title === 'h264_v4l2m2m') {
			title = t('admin.layout.codecSelector.codecV4l2');
		} else if (title === 'h264_omx') {
			title = t('admin.layout.codecSelector.codecOmx');
		} else if (title === 'h264_videotoolbox') {
			title = t('admin.layout.codecSelector.codecVideoToolbox');
		}

		return (
			<Option key={codec} value={codec}>
				{title}
			</Option>
		);
	});

	let description = '';
	if (selectedCodec === 'libx264') {
		description = t('admin.layout.codecSelector.descLibx264');
	} else if (selectedCodec === 'h264_nvenc') {
		description = t('admin.layout.codecSelector.descNvenc');
	} else if (selectedCodec === 'h264_vaapi') {
		description = t('admin.layout.codecSelector.descVaapi');
	} else if (selectedCodec === 'h264_qsv') {
		description = t('admin.layout.codecSelector.descQsv');
	} else if (selectedCodec === 'h264_v4l2m2m') {
		description = t('admin.layout.codecSelector.descV4l2');
	} else if (selectedCodec === 'h264_omx') {
		description = t('admin.layout.codecSelector.descOmx');
	} else if (selectedCodec === 'h264_videotoolbox') {
		description = t('admin.layout.codecSelector.descVideoToolbox');
	}

	return (
		<>
			<Title level={3} className="section-title">
				{t('admin.layout.codecSelector.title')}
			</Title>
			<div className="description">
				{t('admin.layout.codecSelector.intro')}
				<p>
					<a
						href="https://owncast.online/docs/codecs?source=admin"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('admin.layout.codecSelector.warningLink')}
					</a>
				</p>
			</div>
			<div className="segment-slider-container">
				<Popconfirm
					title={t('admin.layout.codecSelector.confirmChange', { codec: pendingSaveCodec })}
					open={confirmPopupOpen}
					placement="leftBottom"
					onConfirm={save}
					onCancel={() => setConfirmPopupOpen(false)}
					okText={t('admin.layout.common.yes')}
					cancelText={t('admin.layout.common.no')}
				>
					<Select
						defaultValue={selectedCodec}
						value={selectedCodec}
						style={{ width: '100%' }}
						onChange={handleChange}
					>
						{items}
					</Select>
				</Popconfirm>
				<FormStatusIndicator status={submitStatus} />

				<p id="selected-codec-note" className="selected-value-note">
					{description}
				</p>
			</div>
		</>
	);
};
