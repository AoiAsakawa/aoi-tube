import React, { FC, useContext, useCallback, useEffect, useState } from 'react';

import { Button, Col, Collapse, Row, Slider, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Paragraph, Title } = Typography;
import { EditCustomStyles } from '../../EditCustomStyles';
import s from './appearance.module.scss';
import { postConfigUpdateToAPI, RESET_TIMEOUT } from '../../../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_SUCCESS,
} from '../../../../utils/input-statuses';
import { ServerStatusContext } from '../../../../utils/server-status-context';
import { FormStatusIndicator } from '../../FormStatusIndicator';

const { Panel } = Collapse;

const ENDPOINT = '/appearance';

interface AppearanceVariable {
	value: string;
	description: string;
}

type ColorCollectionProps = {
	variables: { name; description; value }[];
	updateColor: (variable: string, color: string, description: string) => void;
};

const chatColorVariables = [
	{ name: 'theme-color-users-0', description: '' },
	{ name: 'theme-color-users-1', description: '' },
	{ name: 'theme-color-users-2', description: '' },
	{ name: 'theme-color-users-3', description: '' },
	{ name: 'theme-color-users-4', description: '' },
	{ name: 'theme-color-users-5', description: '' },
	{ name: 'theme-color-users-6', description: '' },
	{ name: 'theme-color-users-7', description: '' },
];

// The descriptions hold i18n keys because this metadata is shared at module
// scope; they are resolved with t() where they are displayed.
const componentColorVariables = [
	{ name: 'theme-color-background-main', description: 'admin.sections.appearance.colorNames.background' },
	{ name: 'theme-color-action', description: 'admin.sections.appearance.colorNames.action' },
	{ name: 'theme-color-action-hover', description: 'admin.sections.appearance.colorNames.actionHover' },
	{
		name: 'theme-color-components-primary-button-border',
		description: 'admin.sections.appearance.colorNames.primaryButtonBorder',
	},
	{
		name: 'theme-color-components-primary-button-text',
		description: 'admin.sections.appearance.colorNames.primaryButtonText',
	},
	{
		name: 'theme-color-components-chat-background',
		description: 'admin.sections.appearance.colorNames.chatBackground',
	},
	{
		name: 'theme-color-components-chat-text',
		description: 'admin.sections.appearance.colorNames.chatText',
	},
	{
		name: 'theme-color-components-text-on-dark',
		description: 'admin.sections.appearance.colorNames.textOnDark',
	},
	{
		name: 'theme-color-components-text-on-light',
		description: 'admin.sections.appearance.colorNames.textOnLight',
	},
	{
		name: 'theme-color-background-header',
		description: 'admin.sections.appearance.colorNames.headerFooter',
	},
	{
		name: 'theme-color-components-content-background',
		description: 'admin.sections.appearance.colorNames.pageContent',
	},
	{
		name: 'theme-color-components-video-status-bar-background',
		description: 'admin.sections.appearance.colorNames.videoStatusBarBackground',
	},
	{
		name: 'theme-color-components-video-status-bar-foreground',
		description: 'admin.sections.appearance.colorNames.videoStatusBarForeground',
	},
];

const others = [
	{ name: 'theme-rounded-corners', description: 'admin.sections.appearance.colorNames.roundedCorners' },
];

// Create an object so these vars can be indexed by name.
const allAvailableValues = [...componentColorVariables, ...chatColorVariables, ...others].reduce(
	(obj, val) => {
		obj[val.name] = { name: val.name, description: val.description };
		return obj;
	},
	{},
);

const ColorPicker = React.memo(
	({
		value,
		name,
		description,
		onChange,
	}: {
		value: string;
		name: string;
		description: string;
		onChange: (name: string, value: string, description: string) => void;
	}) => (
		<Col span={3} key={name}>
			<input
				type="color"
				id={name}
				name={description}
				title={description}
				value={value}
				className={s.colorPicker}
				onChange={e => onChange(name, e.target.value, description)}
			/>
			<div style={{ padding: '2px' }}>{description}</div>
		</Col>
	),
);

ColorPicker.displayName = 'ColorPicker';

const ColorCollection: FC<ColorCollectionProps> = ({ variables, updateColor }) => {
	const cc = variables.map(colorVar => {
		const { name, description, value } = colorVar;

		return (
			<ColorPicker
				key={name}
				value={value}
				name={name}
				description={description}
				onChange={updateColor}
			/>
		);
	});
	return <>{cc}</>;
};

export default function Appearance() {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData;
	const { instanceDetails } = serverConfig;
	const { appearanceVariables } = instanceDetails;

	const [defaultValues, setDefaultValues] = useState<Record<string, AppearanceVariable>>();
	const [customValues, setCustomValues] = useState<Record<string, AppearanceVariable>>();

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	let resetTimer = null;
	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	const setDefaults = () => {
		const c = {};
		[...componentColorVariables, ...chatColorVariables, ...others].forEach(color => {
			const resolvedColor = getComputedStyle(document.documentElement).getPropertyValue(
				`--${color.name}`,
			);
			c[color.name] = { value: resolvedColor.trim(), description: color.description };
		});
		setDefaultValues(c);
	};

	useEffect(() => {
		setDefaults();
	}, []);

	useEffect(() => {
		if (Object.keys(appearanceVariables).length === 0) return;

		const c = {};
		Object.keys(appearanceVariables).forEach(key => {
			c[key] = {
				value: appearanceVariables[key],
				description: allAvailableValues[key]?.description || '',
			};
		});
		setCustomValues(c);
	}, [appearanceVariables]);

	const updateColor = useCallback((variable: string, color: string, description: string) => {
		setCustomValues(oldCustomValues => ({
			...oldCustomValues,
			[variable]: { value: color, description },
		}));
	}, []);

	const reset = async () => {
		await postConfigUpdateToAPI({
			apiPath: ENDPOINT,
			data: { value: {} },
			onSuccess: () => {
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.appearance.updated')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
				setCustomValues({});
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	const save = async () => {
		const c = {};
		Object.keys(customValues).forEach(color => {
			c[color] = customValues[color].value;
		});

		await postConfigUpdateToAPI({
			apiPath: ENDPOINT,
			data: { value: c },
			onSuccess: () => {
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.appearance.updated')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	const onBorderRadiusChange = (value: string) => {
		const variableName = 'theme-rounded-corners';

		updateColor(variableName, `${value.toString()}px`, '');
	};

	if (!defaultValues) {
		return <div>{t('admin.sections.appearance.loading')}</div>;
	}

	const transformToColorMap = variables =>
		variables.map(colorVar => {
			const source = customValues?.[colorVar.name] ? customValues : defaultValues;
			const { name, description } = colorVar;
			const { value } = source[name];
			// The stored description is an i18n key; resolve it for display.
			return { name, description: description ? t(description) : '', value };
		});

	return (
		<>
			<Space direction="vertical">
				{/* Module heading; the page h1 is the constant AdminPageHeader
				    above the tabs. Level 3 matches the sibling custom-styles
				    module heading rendered below in the same tab. */}
				<Title level={3}>{t('admin.sections.appearance.title')}</Title>
				<Paragraph>{t('admin.sections.appearance.description')}</Paragraph>
				<div>
					<Collapse defaultActiveKey={['1']}>
						<Panel header={<strong>{t('admin.sections.appearance.sectionColors')}</strong>} key="1">
							<p>{t('admin.sections.appearance.sectionColorsDescription')}</p>
							<Row gutter={[16, 16]}>
								<ColorCollection
									variables={transformToColorMap(componentColorVariables)}
									updateColor={updateColor}
								/>
							</Row>
						</Panel>
						<Panel
							header={<strong>{t('admin.sections.appearance.chatUserColors')}</strong>}
							key="2"
						>
							<Row gutter={[16, 16]}>
								<ColorCollection
									variables={transformToColorMap(chatColorVariables)}
									updateColor={updateColor}
								/>
							</Row>
						</Panel>
						<Panel header={<strong>{t('admin.sections.appearance.otherSettings')}</strong>} key="4">
							{t('admin.sections.appearance.roundedCornersAmount')}
							<Row gutter={[16, 16]}>
								<Col span={12}>
									<Slider
										min={0}
										max={20}
										tooltip={{ formatter: null }}
										onChange={v => {
											onBorderRadiusChange(v);
										}}
										value={Number(
											customValues?.['theme-rounded-corners']?.value?.replace('px', '') ??
												defaultValues?.['theme-rounded-corners']?.value?.replace('px', '') ??
												0,
										)}
									/>
								</Col>
								<Col span={4}>
									<div
										style={{
											width: '100px',
											height: '30px',
											borderRadius: `${
												customValues?.['theme-rounded-corners']?.value ??
												defaultValues?.['theme-rounded-corners']?.value
											}`,
											backgroundColor: 'var(--theme-color-palette-7)',
										}}
									/>
								</Col>
							</Row>
						</Panel>
					</Collapse>
				</div>

				<Space direction="horizontal">
					<Button type="primary" onClick={save}>
						{t('admin.sections.appearance.saveColors')}
					</Button>
					<Button type="text" onClick={reset}>
						{t('admin.sections.appearance.resetToDefaults')}
					</Button>
				</Space>
				<FormStatusIndicator status={submitStatus} />
			</Space>
			<div className="form-module page-content-module">
				<EditCustomStyles />
			</div>
		</>
	);
}
