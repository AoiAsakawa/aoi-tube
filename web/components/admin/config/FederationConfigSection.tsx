import { Typography, Modal, Button, Row, Col, Alert } from 'antd';
import React, { useContext, useEffect, useState, FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
	TEXTFIELD_TYPE_TEXT,
	TEXTFIELD_TYPE_TEXTAREA,
	TEXTFIELD_TYPE_URL,
} from '../TextField';
import { TextFieldWithSubmit } from '../TextFieldWithSubmit';
import { ToggleSwitch } from '../ToggleSwitch';
import { EditValueArray } from '../EditValueArray';
import { UpdateArgs } from '../../../types/config-section';
import {
	FIELD_PROPS_ENABLE_FEDERATION,
	TEXTFIELD_PROPS_FEDERATION_LIVE_MESSAGE,
	TEXTFIELD_PROPS_FEDERATION_DEFAULT_USER,
	FIELD_PROPS_FEDERATION_IS_PRIVATE,
	FIELD_PROPS_SHOW_FEDERATION_ENGAGEMENT,
	TEXTFIELD_PROPS_FEDERATION_INSTANCE_URL,
	FIELD_PROPS_FEDERATION_BLOCKED_DOMAINS,
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
	API_FEDERATION_BLOCKED_DOMAINS,
	FIELD_PROPS_FEDERATION_NSFW,
} from '../../../utils/config-constants';
import { ServerStatusContext } from '../../../utils/server-status-context';
import { createInputStatus, STATUS_ERROR, STATUS_SUCCESS } from '../../../utils/input-statuses';

export type FederationInfoModalProps = {
	cancelPressed: () => void;
	okPressed: () => void;
};

const FederationInfoModal: FC<FederationInfoModalProps> = ({ cancelPressed, okPressed }) => {
	const { t } = useTranslation();

	return (
		<Modal
			width="70%"
			title={t('admin.sections.federation.modal.title')}
			visible
			onCancel={cancelPressed}
			footer={
				<div>
					<Button onClick={cancelPressed}>{t('admin.sections.federation.modal.cancelButton')}</Button>
					<Button type="primary" onClick={okPressed}>
						{t('admin.sections.federation.modal.okButton')}
					</Button>
				</div>
			}
		>
			<Typography.Title level={3}>
				{t('admin.sections.federation.modal.howItWorksTitle')}
			</Typography.Title>
			<Typography.Paragraph>
				{t('admin.sections.federation.modal.intro.beforeLink')}{' '}
				<a href="https://en.wikipedia.org/wiki/Fediverse" rel="noopener noreferrer" target="_blank">
					{t('admin.sections.federation.modal.intro.linkText')}
				</a>
				{t('admin.sections.federation.modal.intro.afterLink')}
			</Typography.Paragraph>
			{t('admin.sections.federation.modal.docs.beforeLink')}{' '}
			<a href="https://owncast.online/docs/social" rel="noopener noreferrer" target="_blank">
				{t('admin.sections.federation.modal.docs.linkText')}
			</a>{' '}
			{t('admin.sections.federation.modal.docs.afterLink')}
			<Typography.Paragraph />
			<Typography.Title level={3}>
				{t('admin.sections.federation.modal.thingsToKnowTitle')}
			</Typography.Title>
			<ul>
				<li>{t('admin.sections.federation.modal.point1')}</li>
				<li>{t('admin.sections.federation.modal.point2')}</li>
				<li>{t('admin.sections.federation.modal.point3')}</li>
				<li>
					<i>{t('admin.sections.federation.modal.point4Term')}</i>
					{t('admin.sections.federation.modal.point4AfterTerm')}
				</li>
			</ul>
			<Typography.Title level={3}>
				{t('admin.sections.federation.modal.learnMoreTitle')}
			</Typography.Title>
			<Typography.Paragraph>
				{t('admin.sections.federation.modal.learnMore.beforeLink')}{' '}
				<a href="https://owncast.online/docs/social" rel="noopener noreferrer" target="_blank">
					{t('admin.sections.federation.modal.learnMore.linkText')}
				</a>{' '}
				{t('admin.sections.federation.modal.learnMore.afterLink')}
			</Typography.Paragraph>
		</Modal>
	);
};

export const FederationConfigSection = () => {
	const { t } = useTranslation();
	const [formDataValues, setFormDataValues] = useState(null);
	const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const [blockedDomainSaveState, setBlockedDomainSaveState] = useState(null);

	const { federation, yp, instanceDetails } = serverConfig;
	const { enabled, isPrivate, username, goLiveMessage, showEngagement, blockedDomains } =
		federation;
	const { instanceUrl } = yp;
	const { nsfw } = instanceDetails;

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	const handleEnabledSwitchChange = (value: boolean) => {
		if (!value) {
			setFormDataValues({
				...formDataValues,
				enabled: false,
			});
		} else {
			setIsInfoModalOpen(true);
		}
	};

	// if instanceUrl is empty, we should also turn OFF the `enabled` field of directory.
	const handleSubmitInstanceUrl = () => {
		const hasInstanceUrl = formDataValues.instanceUrl !== '';
		const isInstanceUrlSecure = formDataValues.instanceUrl.startsWith('https://');

		if (!hasInstanceUrl || !isInstanceUrlSecure) {
			postConfigUpdateToAPI({
				apiPath: FIELD_PROPS_ENABLE_FEDERATION.apiPath,
				data: { value: false },
			});
			setFormDataValues({
				...formDataValues,
				enabled: false,
			});
		}
	};

	function federationInfoModalCancelPressed() {
		setIsInfoModalOpen(false);
		setFormDataValues({
			...formDataValues,
			enabled: false,
		});
	}

	function federationInfoModalOkPressed() {
		setIsInfoModalOpen(false);
		setFormDataValues({
			...formDataValues,
			enabled: true,
		});
	}

	function resetBlockedDomainsSaveState() {
		setBlockedDomainSaveState(null);
	}

	function saveBlockedDomains() {
		try {
			postConfigUpdateToAPI({
				apiPath: API_FEDERATION_BLOCKED_DOMAINS,
				data: { value: formDataValues.blockedDomains },
				onSuccess: () => {
					setFieldInConfigState({
						fieldName: 'forbiddenUsernames',
						value: formDataValues.forbiddenUsernames,
					});
					setBlockedDomainSaveState(STATUS_SUCCESS);
					setTimeout(resetBlockedDomainsSaveState, RESET_TIMEOUT);
				},
				onError: (message: string) => {
					setBlockedDomainSaveState(createInputStatus(STATUS_ERROR, message));
					setTimeout(resetBlockedDomainsSaveState, RESET_TIMEOUT);
				},
			});
		} catch (e) {
			console.error(e);
			setBlockedDomainSaveState(STATUS_ERROR);
		}
	}

	function handleDeleteBlockedDomain(index: number) {
		formDataValues.blockedDomains.splice(index, 1);
		saveBlockedDomains();
	}

	function handleCreateBlockedDomain(domain: string) {
		let newDomain;
		try {
			const u = new URL(domain);
			newDomain = u.host;
		} catch {
			newDomain = domain;
		}

		formDataValues.blockedDomains.push(newDomain);
		handleFieldChange({
			fieldName: 'blockedDomains',
			value: formDataValues.blockedDomains,
		});
		saveBlockedDomains();
	}

	useEffect(() => {
		setFormDataValues({
			enabled,
			isPrivate,
			username,
			goLiveMessage,
			showEngagement,
			blockedDomains,
			nsfw,
			instanceUrl: yp.instanceUrl,
		});
	}, [serverConfig, yp]);

	if (!formDataValues) {
		return null;
	}

	const hasInstanceUrl = instanceUrl !== '';
	const isInstanceUrlSecure = instanceUrl.startsWith('https://');
	const configurationWarning = !isInstanceUrlSecure && (
		<>
			<Alert
				message={t('admin.sections.federation.httpsWarning')}
				type="warning"
				showIcon
			/>
			<br />
			<TextFieldWithSubmit
				fieldName="instanceUrl"
				{...TEXTFIELD_PROPS_FEDERATION_INSTANCE_URL}
				value={formDataValues.instanceUrl}
				initialValue={yp.instanceUrl}
				type={TEXTFIELD_TYPE_URL}
				onChange={handleFieldChange}
				onSubmit={handleSubmitInstanceUrl}
				required
			/>
		</>
	);

	const invalidPortWarning = (
		<Alert
			message={t('admin.sections.federation.portWarning')}
			type="warning"
			showIcon
		/>
	);

	const hasInvalidPort =
		instanceUrl && new URL(instanceUrl).port !== '' && new URL(instanceUrl).port !== '443';

	return (
		<div>
			{/* The module title is rendered by the SettingsCard that hosts this
			    section on the notifications page. */}
			<p>
				{t('admin.sections.federation.intro.beforeStrong')}
				<strong>{t('admin.sections.federation.intro.strongText')}</strong>
				{t('admin.sections.federation.intro.afterStrong')}
			</p>
			<p>{t('admin.sections.federation.enableNotice')}</p>
			<p>
				<a href="https://owncast.online/docs/social" rel="noopener noreferrer" target="_blank">
					{t('admin.sections.federation.learnMoreLink')}
				</a>
			</p>
			<Row>
				<Col span={24}>
					{configurationWarning}
					{hasInvalidPort && invalidPortWarning}
					<ToggleSwitch
						fieldName="enabled"
						onChange={handleEnabledSwitchChange}
						{...FIELD_PROPS_ENABLE_FEDERATION}
						checked={formDataValues.enabled}
						disabled={hasInvalidPort || !hasInstanceUrl || !isInstanceUrlSecure}
					/>
					<ToggleSwitch
						fieldName="isPrivate"
						{...FIELD_PROPS_FEDERATION_IS_PRIVATE}
						checked={formDataValues.isPrivate}
						disabled={!enabled}
					/>
					<ToggleSwitch
						fieldName="nsfw"
						useSubmit
						{...FIELD_PROPS_FEDERATION_NSFW}
						checked={formDataValues.nsfw}
						disabled={hasInvalidPort || !hasInstanceUrl}
					/>
					<TextFieldWithSubmit
						required
						fieldName="username"
						type={TEXTFIELD_TYPE_TEXT}
						{...TEXTFIELD_PROPS_FEDERATION_DEFAULT_USER}
						value={formDataValues.username}
						initialValue={username}
						onChange={handleFieldChange}
						disabled={!enabled}
					/>
					<TextFieldWithSubmit
						fieldName="goLiveMessage"
						{...TEXTFIELD_PROPS_FEDERATION_LIVE_MESSAGE}
						type={TEXTFIELD_TYPE_TEXTAREA}
						value={formDataValues.goLiveMessage}
						initialValue={goLiveMessage}
						onChange={handleFieldChange}
						disabled={!enabled}
					/>
					<ToggleSwitch
						fieldName="showEngagement"
						{...FIELD_PROPS_SHOW_FEDERATION_ENGAGEMENT}
						checked={formDataValues.showEngagement}
						disabled={!enabled}
					/>
				</Col>
				<Col span={24} style={{ marginTop: '15px' }}>
					<EditValueArray
						title={FIELD_PROPS_FEDERATION_BLOCKED_DOMAINS.label}
						placeholder={FIELD_PROPS_FEDERATION_BLOCKED_DOMAINS.placeholder}
						description={FIELD_PROPS_FEDERATION_BLOCKED_DOMAINS.tip}
						values={formDataValues.blockedDomains}
						handleDeleteIndex={handleDeleteBlockedDomain}
						handleCreateString={handleCreateBlockedDomain}
						submitStatus={createInputStatus(blockedDomainSaveState)}
					/>
				</Col>
			</Row>
			{isInfoModalOpen && (
				<FederationInfoModal
					cancelPressed={federationInfoModalCancelPressed}
					okPressed={federationInfoModalOkPressed}
				/>
			)}
		</div>
	);
};
