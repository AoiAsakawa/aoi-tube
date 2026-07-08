// This content populates the video variant modal, which is spawned from the variants table. This relies on the `dataState` prop fed in by the table.
import React, { FC } from 'react';
import { Popconfirm, Row, Col, Slider, Collapse, Typography, Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import dynamic from '@components/compat/dynamic';
import { FieldUpdaterFunc, VideoVariant, UpdateArgs } from '../../types/config-section';
import { TextField } from './TextField';
import {
	DEFAULT_VARIANT_STATE,
	VIDEO_VARIANT_SETTING_DEFAULTS,
	VIDEO_NAME_DEFAULTS,
	ENCODER_PRESET_SLIDER_MARKS,
	ENCODER_PRESET_TOOLTIPS,
	VIDEO_BITRATE_DEFAULTS,
	VIDEO_BITRATE_SLIDER_MARKS,
	FRAMERATE_SLIDER_MARKS,
	FRAMERATE_DEFAULTS,
	FRAMERATE_TOOLTIPS,
} from '../../utils/config-constants';
import { ToggleSwitch } from './ToggleSwitch';

const { Panel } = Collapse;

// Lazy loaded components

const ExclamationCircleFilled = dynamic(() => import('@ant-design/icons/ExclamationCircleFilled'), {
	ssr: false,
});

export type VideoVariantFormProps = {
	dataState: VideoVariant;
	onUpdateField: FieldUpdaterFunc;
};

export const VideoVariantForm: FC<VideoVariantFormProps> = ({
	dataState = DEFAULT_VARIANT_STATE,
	onUpdateField,
}) => {
	const { t } = useTranslation();
	// Strings coming from config-constants are i18n keys (admin.fields.*).
	const tr = (text?: string): string => (text ? t(text, { defaultValue: text }) : text);
	// The encoder preset slider mark labels are i18n keys as well.
	const encoderPresetSliderMarks = {
		...ENCODER_PRESET_SLIDER_MARKS,
		0: { ...ENCODER_PRESET_SLIDER_MARKS[0], label: tr(ENCODER_PRESET_SLIDER_MARKS[0].label) },
		4: { ...ENCODER_PRESET_SLIDER_MARKS[4], label: tr(ENCODER_PRESET_SLIDER_MARKS[4].label) },
	};
	const videoPassthroughEnabled = dataState.videoPassthrough;

	const handleFramerateChange = (value: number) => {
		onUpdateField({ fieldName: 'framerate', value });
	};
	const handleVideoBitrateChange = (value: number) => {
		onUpdateField({ fieldName: 'videoBitrate', value });
	};
	const handleVideoCpuUsageLevelChange = (value: number) => {
		onUpdateField({ fieldName: 'cpuUsageLevel', value });
	};
	const handleScaledWidthChanged = (args: UpdateArgs) => {
		const value = Number(args.value);
		if (isNaN(value)) {
			return;
		}
		onUpdateField({ fieldName: 'scaledWidth', value: value || 0 });
	};
	const handleScaledHeightChanged = (args: UpdateArgs) => {
		const value = Number(args.value);
		if (isNaN(value)) {
			return;
		}
		onUpdateField({ fieldName: 'scaledHeight', value: value || 0 });
	};

	// Video passthrough handling
	const handleVideoPassConfirm = () => {
		onUpdateField({ fieldName: 'videoPassthrough', value: true });
	};
	// If passthrough is currently on, set it back to false on toggle.
	// Else let the Popconfirm turn it on.
	const handleVideoPassthroughToggle = (value: boolean) => {
		if (videoPassthroughEnabled) {
			onUpdateField({ fieldName: 'videoPassthrough', value });
		}
	};

	const handleNameChanged = (args: UpdateArgs) => {
		onUpdateField({ fieldName: 'name', value: args.value });
	};

	// Slider notes
	const selectedVideoBRnote = () => {
		if (videoPassthroughEnabled) {
			return t('admin.layout.videoVariantForm.passthroughBitrateNote');
		}
		let note = `${dataState.videoBitrate}${VIDEO_BITRATE_DEFAULTS.unit}`;
		if (dataState.videoBitrate < 2000) {
			note = `${note} - ${t('admin.layout.videoVariantForm.bitrateLow')}`;
		} else if (dataState.videoBitrate < 3500) {
			note = `${note} - ${t('admin.layout.videoVariantForm.bitrateMedium')}`;
		} else {
			note = `${note} - ${t('admin.layout.videoVariantForm.bitrateHigh')}`;
		}
		return note;
	};
	const selectedFramerateNote = () => {
		if (videoPassthroughEnabled) {
			return t('admin.layout.videoVariantForm.passthroughFramerateNote');
		}
		return tr(FRAMERATE_TOOLTIPS[dataState.framerate]) || '';
	};
	const cpuUsageNote = () => {
		if (videoPassthroughEnabled) {
			return t('admin.layout.videoVariantForm.passthroughCpuNote');
		}
		return tr(ENCODER_PRESET_TOOLTIPS[dataState.cpuUsageLevel]) || '';
	};

	const classes = classNames({
		'config-variant-form': true,
		'video-passthrough-enabled': videoPassthroughEnabled,
	});
	return (
		<div className={classes}>
			<div className="video-varient-alert">
				<Alert
					type="info"
					action={
						<a
							href="https://owncast.online/docs/video?source=admin"
							target="_blank"
							rel="noopener noreferrer"
						>
							<div className="video-varient-alert-button-container">
								<Button size="small" type="text" icon={<ExclamationCircleFilled />}>
									{t('admin.layout.videoVariantForm.learnMoreSettings')}
								</Button>
							</div>
						</a>
					}
				/>
			</div>
			{videoPassthroughEnabled && (
				<p className="passthrough-warning">
					{t('admin.layout.videoVariantForm.passthroughWarningPrefix')}{' '}
					<em>{t('admin.layout.videoVariantForm.passthroughWarningEm')}</em>{' '}
					{t('admin.layout.videoVariantForm.passthroughWarningSuffix')}
				</p>
			)}

			<Row gutter={16}>
				<Col xs={24} lg={{ span: 24, pull: 3 }} className="video-text-field-container">
					<TextField
						maxLength="10"
						{...VIDEO_NAME_DEFAULTS}
						value={dataState.name}
						onChange={handleNameChanged}
					/>
				</Col>
				<Col sm={24} md={12}>
					<div className="form-module cpu-usage-container">
						<Typography.Title level={3}>
							{t('admin.layout.videoVariantForm.cpuUsageTitle')}
						</Typography.Title>
						<p className="description">{t('admin.layout.videoVariantForm.cpuUsageDesc')}</p>
						<div className="segment-slider-container">
							<Slider
								tooltip={{ formatter: value => tr(ENCODER_PRESET_TOOLTIPS[value]) }}
								onChange={handleVideoCpuUsageLevelChange}
								min={0}
								max={Object.keys(ENCODER_PRESET_SLIDER_MARKS).length - 1}
								marks={encoderPresetSliderMarks}
								defaultValue={dataState.cpuUsageLevel}
								value={dataState.cpuUsageLevel}
								disabled={dataState.videoPassthrough}
							/>
							<p className="selected-value-note">{cpuUsageNote()}</p>
						</div>
						<p className="read-more-subtext">
							{t('admin.layout.videoVariantForm.cpuUsageSubtext')}
							<br />
							<br />
							<a
								href="https://owncast.online/docs/video/?source=admin#cpu-usage"
								target="_blank"
								rel="noopener noreferrer"
							>
								{t('admin.layout.videoVariantForm.learnMoreHardware')}
							</a>
						</p>
					</div>
				</Col>
				<Col sm={24} md={11} offset={1}>
					{/* VIDEO BITRATE FIELD */}
					<div
						className={`form-module bitrate-container ${
							dataState.videoPassthrough ? 'disabled' : ''
						}`}
					>
						<Typography.Title level={3}>
							{t('admin.layout.videoVariantForm.videoBitrateTitle')}
						</Typography.Title>
						<p className="description">{tr(VIDEO_BITRATE_DEFAULTS.tip)}</p>
						<div className="segment-slider-container">
							<Slider
								tooltip={{ formatter: value => `${value} ${VIDEO_BITRATE_DEFAULTS.unit}` }}
								disabled={dataState.videoPassthrough}
								defaultValue={dataState.videoBitrate}
								value={dataState.videoBitrate}
								onChange={handleVideoBitrateChange}
								step={VIDEO_BITRATE_DEFAULTS.incrementBy}
								min={VIDEO_BITRATE_DEFAULTS.min}
								max={VIDEO_BITRATE_DEFAULTS.max}
								marks={VIDEO_BITRATE_SLIDER_MARKS}
							/>
							<p className="selected-value-note">{selectedVideoBRnote()}</p>
						</div>
						<p className="read-more-subtext">
							<a
								href="https://owncast.online/docs/video/?source=admin"
								target="_blank"
								rel="noopener noreferrer"
							>
								{t('admin.layout.videoVariantForm.learnMoreBitrate')}
							</a>
						</p>
					</div>
				</Col>
			</Row>
			<Collapse className="advanced-settings">
				<Panel header={t('admin.layout.common.advancedSettings')} key="1">
					<Row gutter={16}>
						<Col sm={24} md={12}>
							<div className="form-module resolution-module">
								<Typography.Title level={3}>
									{t('admin.layout.videoVariantForm.resolutionTitle')}
								</Typography.Title>
								<p className="description">
									{t('admin.layout.videoVariantForm.resolutionDesc1')}{' '}
									<strong>{t('admin.layout.videoVariantForm.resolutionDescOr')}</strong>{' '}
									{t('admin.layout.videoVariantForm.resolutionDesc2')}
									<br />
									<br />
									<a
										href="https://owncast.online/docs/video/?source=admin"
										target="_blank"
										rel="noopener noreferrer"
									>
										{t('admin.layout.videoVariantForm.learnMoreResolution')}
									</a>
								</p>
								<br />
								<TextField
									type="number"
									{...VIDEO_VARIANT_SETTING_DEFAULTS.scaledWidth}
									value={dataState.scaledWidth}
									onChange={handleScaledWidthChanged}
									disabled={dataState.videoPassthrough}
								/>
								<TextField
									type="number"
									{...VIDEO_VARIANT_SETTING_DEFAULTS.scaledHeight}
									value={dataState.scaledHeight}
									onChange={handleScaledHeightChanged}
									disabled={dataState.videoPassthrough}
								/>
							</div>
						</Col>
						<Col sm={24} md={12}>
							{/* VIDEO PASSTHROUGH FIELD */}
							<div className="form-module video-passthrough-module">
								<Typography.Title level={3}>
									{t('admin.layout.videoVariantForm.passthroughTitle')}
								</Typography.Title>
								<div className="description">
									<p>
										{t('admin.layout.videoVariantForm.passthroughDesc1Prefix')}{' '}
										<strong>{t('admin.layout.videoVariantForm.passthroughDesc1Strong')}</strong>{' '}
										{t('admin.layout.videoVariantForm.passthroughDesc1Suffix')}
									</p>
									<p>{t('admin.layout.videoVariantForm.passthroughDesc2')}</p>
									<p>
										<a
											href="https://owncast.online/docs/video/?source=admin#video-passthrough"
											target="_blank"
											rel="noopener noreferrer"
										>
											{t('admin.layout.videoVariantForm.passthroughDocsLink')}
										</a>
									</p>
								</div>
								<div className="advanced-switch-container">
									<Popconfirm
										disabled={dataState.videoPassthrough === true}
										title={t('admin.layout.videoVariantForm.passthroughConfirm')}
										icon={<ExclamationCircleFilled />}
										onConfirm={handleVideoPassConfirm}
										okText={t('admin.layout.common.yes')}
										cancelText={t('admin.layout.common.no')}
										getPopupContainer={triggerNode => triggerNode}
										placement="topLeft"
									>
										{/* adding an <a> tag to force Popcofirm to register click on toggle */}
										<a href="#">
											<div className="advanced-description-switch-container">
												<div className="advanced-description-wrapper">
													<p>{t('admin.layout.videoVariantForm.usePassthrough')}</p>
												</div>
												<ToggleSwitch
													label=""
													fieldName="video-passthrough"
													checked={dataState.videoPassthrough}
													onChange={handleVideoPassthroughToggle}
												/>
											</div>
										</a>
										<p>*{tr(VIDEO_VARIANT_SETTING_DEFAULTS.videoPassthrough.tip)}</p>
									</Popconfirm>
								</div>
							</div>
						</Col>
					</Row>

					{/* FRAME RATE FIELD */}
					<div className="form-module frame-rate-module">
						<Typography.Title level={3}>
							{t('admin.layout.videoVariantForm.framerateTitle')}
						</Typography.Title>
						<p className="description">{tr(FRAMERATE_DEFAULTS.tip)}</p>
						<div className="segment-slider-container">
							<Slider
								tooltip={{ formatter: value => `${value} ${FRAMERATE_DEFAULTS.unit}` }}
								defaultValue={dataState.framerate}
								value={dataState.framerate}
								onChange={handleFramerateChange}
								step={FRAMERATE_DEFAULTS.incrementBy}
								min={FRAMERATE_DEFAULTS.min}
								max={FRAMERATE_DEFAULTS.max}
								marks={FRAMERATE_SLIDER_MARKS}
								disabled={dataState.videoPassthrough}
							/>
							<p className="selected-value-note">{selectedFramerateNote()}</p>
						</div>
						<p className="read-more-subtext">
							<a
								href="https://owncast.online/docs/video/?source=admin#framerate"
								target="_blank"
								rel="noopener noreferrer"
							>
								{t('admin.layout.videoVariantForm.learnMoreFramerate')}
							</a>
						</p>
					</div>
				</Panel>
			</Collapse>
		</div>
	);
};
