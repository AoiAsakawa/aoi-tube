import React, { useContext, useEffect, useState } from 'react';
import { Table, Space, Button, Typography, Alert, Input, Form, message } from 'antd';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { ServerStatusContext } from '../../../../utils/server-status-context';

import { fetchData, UPDATE_STREAM_KEYS } from '../../../../utils/apis';
import { PASSWORD_COMPLEXITY_RULES, REGEX_PASSWORD } from '../../../../utils/config-constants';

const { Paragraph } = Typography;

// Lazy loaded components

const DeleteOutlined = dynamic(() => import('@ant-design/icons/DeleteOutlined'), {
	ssr: false,
});

const EyeOutlined = dynamic(() => import('@ant-design/icons/EyeOutlined'), {
	ssr: false,
});

const PlusOutlined = dynamic(() => import('@ant-design/icons/PlusOutlined'), {
	ssr: false,
});

const saveKeys = async (keys, setError) => {
	try {
		await fetchData(UPDATE_STREAM_KEYS, {
			method: 'POST',
			auth: true,
			data: { value: keys },
		});
	} catch (error) {
		console.error(error);
		setError(error);
	}
};
export const generateRndKey = () => {
	let defaultKey = '';
	let isValidStreamKey = false;
	const streamKeyRegex = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$^&*]).{8,192}$/;
	const s = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$^&*';

	while (!isValidStreamKey) {
		const temp = Array.apply(20, Array(30))
			.map(() => s.charAt(Math.floor(Math.random() * s.length)))
			.join('');
		if (streamKeyRegex.test(temp)) {
			isValidStreamKey = true;
			defaultKey = temp;
		}
	}
	return defaultKey;
};

const AddKeyForm = ({ setShowAddKeyForm, setFieldInConfigState, streamKeys, setError }) => {
	const { t } = useTranslation();
	// Password complexity rule messages are i18n keys from config-constants.
	const translatedPasswordRules = PASSWORD_COMPLEXITY_RULES.map(rule => ({
		...rule,
		message: t(rule.message, { defaultValue: rule.message }),
	}));
	const [hasChanged, setHasChanged] = useState(true);
	const [form] = Form.useForm();
	const { Item } = Form;

	// Password Complexity rules
	const passwordComplexityRules = [];

	useEffect(() => {
		PASSWORD_COMPLEXITY_RULES.forEach(element => {
			passwordComplexityRules.push(element);
		});
	}, []);

	const handleAddKey = (newkey: any) => {
		const updatedKeys = [...streamKeys, newkey];

		setFieldInConfigState({
			fieldName: 'streamKeys',
			value: updatedKeys,
		});

		saveKeys(updatedKeys, setError);

		setShowAddKeyForm(false);
	};

	const handleInputChange = (event: any) => {
		const val = event.target.value;
		if (REGEX_PASSWORD.test(val)) {
			setHasChanged(true);
		} else {
			setHasChanged(false);
		}
	};

	// Default auto-generated key
	const defaultKey = generateRndKey();

	return (
		<Form
			layout="horizontal"
			autoComplete="off"
			onFinish={handleAddKey}
			form={form}
			style={{ display: 'flex', flexDirection: 'row' }}
			initialValues={{ key: defaultKey, comment: t('admin.sections.streamKeys.defaultComment') }}
		>
			<Item
				style={{ width: '60%', marginRight: '5px' }}
				label={t('admin.sections.streamKeys.keyLabel')}
				name="key"
				tooltip={<p>{t('admin.sections.streamKeys.keyTooltip')}</p>}
				rules={translatedPasswordRules}
			>
				<Input
					placeholder={t('admin.sections.streamKeys.keyPlaceholder')}
					onChange={handleInputChange}
				/>
			</Item>
			<Item
				style={{ width: '60%', marginRight: '5px' }}
				label={t('admin.sections.streamKeys.commentLabel')}
				name="comment"
				tooltip={t('admin.sections.streamKeys.commentTooltip')}
			>
				<Input placeholder={t('admin.sections.streamKeys.commentPlaceholder')} />
			</Item>
			<Button type="primary" htmlType="submit" disabled={!hasChanged}>
				{t('admin.sections.streamKeys.add')}
			</Button>
		</Form>
	);
};

const AddKeyButton = ({ setShowAddKeyForm }) => (
	<Button type="default" onClick={() => setShowAddKeyForm(true)}>
		<PlusOutlined />
	</Button>
);

const StreamKeys = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { streamKeys = [] } = serverConfig || {};
	const [showAddKeyForm, setShowAddKeyForm] = useState(false);
	const [showKeyMap, setShowKeyMap] = useState({});
	const [error, setError] = useState(null);

	// Lives inside the component so the clipboard feedback can be localized.
	const copyText = (text: string) => {
		navigator.clipboard
			.writeText(text)
			.then(() => message.success(t('admin.sections.streamKeys.copied')))
			.catch(() => message.error(t('admin.sections.streamKeys.copyFailed')));
	};

	const handleDeleteKey = keyToRemove => {
		const newKeys = streamKeys.filter(k => k !== keyToRemove);
		setFieldInConfigState({
			fieldName: 'streamKeys',
			value: newKeys,
		});
		saveKeys(newKeys, setError);
	};

	const handleToggleShowKey = key => {
		setShowKeyMap({
			...showKeyMap,
			[key]: !showKeyMap[key],
		});
	};

	const columns = [
		{
			title: t('admin.sections.streamKeys.columns.key'),
			dataIndex: 'key',
			key: 'key',
			render: text => (
				<Space direction="horizontal">
					<Paragraph
						copyable={{
							text: showKeyMap[text] ? text : '**********',
							onCopy: () => copyText(text),
						}}
					>
						{showKeyMap[text] ? text : '**********'}
					</Paragraph>

					<Button
						type="link"
						style={{ top: '-7px' }}
						icon={<EyeOutlined />}
						onClick={() => handleToggleShowKey(text)}
					/>
				</Space>
			),
		},
		{
			title: t('admin.sections.streamKeys.columns.comment'),
			dataIndex: 'comment',
			key: 'comment',
		},
		{
			title: '',
			key: 'delete',
			render: text => <Button onClick={() => handleDeleteKey(text)} icon={<DeleteOutlined />} />,
		},
	];

	return (
		<div>
			<Paragraph>{t('admin.sections.streamKeys.intro1')}</Paragraph>
			<Paragraph>{t('admin.sections.streamKeys.intro2')}</Paragraph>
			<Paragraph>
				{t('admin.sections.streamKeys.docs.beforeLink')}{' '}
				<a
					href="https://owncast.online/docs/broadcasting/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.sections.streamKeys.docs.linkText')}
				</a>
				.
			</Paragraph>

			<Space direction="vertical" style={{ width: '70%' }}>
				{error && (
					<Alert
						type="error"
						message={t('admin.sections.streamKeys.saveError')}
						description={String(error)}
					/>
				)}

				{streamKeys.length === 0 && (
					<Alert
						message={t('admin.sections.streamKeys.noKeysTitle')}
						description={t('admin.sections.streamKeys.noKeysDescription')}
						type="error"
					/>
				)}

				<Table
					rowKey="key"
					columns={columns}
					dataSource={streamKeys}
					pagination={false}
					footer={() =>
						showAddKeyForm ? (
							<AddKeyForm
								setShowAddKeyForm={setShowAddKeyForm}
								streamKeys={streamKeys}
								setFieldInConfigState={setFieldInConfigState}
								setError={setError}
							/>
						) : (
							<AddKeyButton setShowAddKeyForm={setShowAddKeyForm} />
						)
					}
				/>
				<br />
			</Space>
		</div>
	);
};
export default StreamKeys;
