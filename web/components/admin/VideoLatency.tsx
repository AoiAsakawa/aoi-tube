import React, { useContext, useState, useEffect, FC } from 'react';
import { Typography, Slider } from 'antd';
import { useTranslation } from 'react-i18next';
import { ServerStatusContext } from '../../utils/server-status-context';
import { AlertMessageContext } from '../../utils/alert-message-context';
import {
	API_VIDEO_SEGMENTS,
	RESET_TIMEOUT,
	postConfigUpdateToAPI,
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

export const VideoLatency: FC = () => {
	const { t } = useTranslation();

	// These used to be module-scope constants; they moved inside the
	// component so the labels re-render when the language changes.
	const sliderMarks = {
		0: t('admin.layout.videoLatency.markLowest'),
		1: ' ',
		2: ' ',
		3: ' ',
		4: t('admin.layout.videoLatency.markHighest'),
	};

	const sliderComments = {
		0: t('admin.layout.videoLatency.comment0'),
		1: t('admin.layout.videoLatency.comment1'),
		2: t('admin.layout.videoLatency.comment2'),
		3: t('admin.layout.videoLatency.comment3'),
		4: t('admin.layout.videoLatency.comment4'),
	};

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [selectedOption, setSelectedOption] = useState(null);
	const [resetTimer, setResetTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

	const serverStatusData = useContext(ServerStatusContext);
	const { setMessage } = useContext(AlertMessageContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { videoSettings } = serverConfig || {};

	useEffect(() => {
		if (videoSettings) {
			setSelectedOption(videoSettings.latencyLevel);
		}
	}, [videoSettings]);

	useEffect(() => {
		return () => {
			if (resetTimer) {
				clearTimeout(resetTimer);
			}
		};
	}, [resetTimer]);

	if (!videoSettings) {
		return null;
	}

	const resetStates = () => {
		setSubmitStatus(null);
		setResetTimer(null);
	};

	// posts all the variants at once as an array obj
	const postUpdateToAPI = async (postValue: any) => {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));

		await postConfigUpdateToAPI({
			apiPath: API_VIDEO_SEGMENTS,
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'latencyLevel',
					value: postValue,
					path: 'videoSettings',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.videoLatency.updated')));

				setResetTimer(setTimeout(resetStates, RESET_TIMEOUT));
				if (serverStatusData.online) {
					setMessage(t('admin.layout.videoLatency.appliesNextStream'));
				}
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));

				setResetTimer(setTimeout(resetStates, RESET_TIMEOUT));
			},
		});
	};

	const handleChange = value => {
		postUpdateToAPI(value);
	};

	return (
		<div className="config-video-latency-container">
			<Title level={3} className="section-title">
				{t('admin.layout.videoLatency.title')}
			</Title>
			<p className="description">{t('admin.layout.videoLatency.desc1')}</p>
			<p className="description">
				{t('admin.layout.videoLatency.desc2')}{' '}
				<a
					href="https://owncast.online/docs/encoding#latency-buffer?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.layout.videoLatency.learnMore')}
				</a>
			</p>

			<div className="segment-slider-container">
				<Slider
					tooltip={{ formatter: value => sliderComments[value] }}
					onChange={handleChange}
					min={0}
					max={4}
					marks={sliderMarks}
					defaultValue={selectedOption}
					value={selectedOption}
				/>
				<p className="selected-value-note">{sliderComments[selectedOption]}</p>
				<FormStatusIndicator status={submitStatus} />
			</div>
		</div>
	);
};
