import React, { FC, useState } from 'react';
import { Typography, Tag } from 'antd';
import { useTranslation } from 'react-i18next';

import { TextField } from './TextField';
import { UpdateArgs } from '../../types/config-section';
import { StatusState } from '../../utils/input-statuses';
import { FormStatusIndicator } from './FormStatusIndicator';

const { Title } = Typography;

export const TAG_COLOR = '#5a67d8';

export type EditStringArrayProps = {
	title: string;
	description?: string;
	placeholder: string;
	maxLength?: number;
	values: string[];
	submitStatus?: StatusState;
	continuousStatusMessage?: StatusState;
	handleDeleteIndex: (index: number) => void;
	handleCreateString: (arg: string) => void;
};

export const EditValueArray: FC<EditStringArrayProps> = ({
	title,
	description = null,
	placeholder,
	maxLength = 50,
	values,
	handleDeleteIndex,
	handleCreateString,
	submitStatus = null,
	continuousStatusMessage = null,
}) => {
	const { t } = useTranslation();
	// `title`/`description` may be i18n keys provided via config-constants.
	const tr = (text?: string): string => (text ? t(text, { defaultValue: text }) : text);
	const [newStringInput, setNewStringInput] = useState<string>('');

	const handleInputChange = ({ value }: UpdateArgs) => {
		setNewStringInput(value);
	};

	const handleSubmitNewString = () => {
		const newString = newStringInput.trim();
		handleCreateString(newString);
		setNewStringInput('');
	};

	return (
		<div className="edit-string-array-container">
			<Title level={3} className="section-title">
				{tr(title)}
			</Title>
			<p className="description">{tr(description)}</p>

			<div className="edit-current-strings">
				{values?.map((tag, index) => {
					const handleClose = () => {
						handleDeleteIndex(index);
					};
					return (
						<Tag closable onClose={handleClose} color={TAG_COLOR} variant="solid" key={`tag-${tag}-${index}`}>
							{tag}
						</Tag>
					);
				})}
			</div>
			{continuousStatusMessage && (
				<div className="continuous-status-section">
					<FormStatusIndicator status={continuousStatusMessage} />
				</div>
			)}
			<div className="add-new-string-section">
				<TextField
					fieldName="string-input"
					value={newStringInput}
					onChange={handleInputChange}
					onPressEnter={handleSubmitNewString}
					maxLength={maxLength}
					placeholder={placeholder}
					status={submitStatus}
				/>
			</div>
		</div>
	);
};
