import React, { CSSProperties, FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Button, Select, Form } from 'antd';
import { MessageType } from '../../../interfaces/socket-events';
import { useWebsocketService, useCurrentUser } from '../../stores/zustand-store';
import styles from './NameChangeModal.module.scss';

const { Option } = Select;

// User color definitions (same values as the CSS variables)
const USER_COLORS = [
	'#ff717b', // 0
	'#f4e413', // 1
	'#b99c45', // 2
	'#58f40b', // 3
	'#0bf4f4', // 4
	'#16a8f7', // 5
	'#9a92ff', // 6
	'#ff53ff', // 7
];

export type UserColorProps = {
	color: number;
};

const UserColor: FC<UserColorProps> = ({ color }) => {
	// Fixed dimensions: inside the select's value cell a 100%-sized div
	// collapses to 0 and the swatch disappears.
	const style: CSSProperties = {
		textAlign: 'center',
		backgroundColor: USER_COLORS[color] || USER_COLORS[0],
		width: 64,
		height: 20,
		borderRadius: 4,
	};
	return <div style={style} />;
};

export const NameChangeModal: FC = () => {
	const { t } = useTranslation();
	const currentUser = useCurrentUser();
	const websocketService = useWebsocketService();
	const [newName, setNewName] = useState<string>(currentUser?.displayName);
	const [selectedColor, setSelectedColor] = useState<number>(currentUser?.displayColor ?? 0);

	if (!currentUser) {
		return null;
	}

	const { displayName } = currentUser;

	const saveEnabled = () =>
		newName !== displayName && newName !== '' && websocketService?.isConnected();

	const handleNameChange = () => {
		if (!saveEnabled()) return;

		const nameChange = {
			type: MessageType.NAME_CHANGE,
			newName,
		};
		websocketService.send(nameChange);
	};

	const handleColorChange = (color: string) => {
		const colorNum = Number(color);
		setSelectedColor(colorNum);
		const colorChange = {
			type: MessageType.COLOR_CHANGE,
			newColor: colorNum,
		};
		websocketService.send(colorChange);
	};

	const maxColor = 8; // 0...n
	const colorOptions = [...Array(maxColor)].map((_, i) => i);

	const saveButton = (
		<Button
			type="primary"
			id="name-change-submit"
			onClick={handleNameChange}
			disabled={!saveEnabled()}
		>
			{t('modals.nameChange.changeButton')}
		</Button>
	);

	return (
		<div className={styles.root}>
			<p className={styles.description}>{t('modals.nameChange.description')}</p>
			<Form onSubmitCapture={handleNameChange} className={styles.form}>
				<Input.Search
					enterButton={saveButton}
					id="name-change-field"
					value={newName}
					onChange={e => setNewName(e.target.value)}
					placeholder={t('modals.nameChange.placeholder')}
					aria-label={t('modals.nameChange.placeholder')}
					maxLength={30}
					showCount
					defaultValue={displayName}
					className={styles.inputGroup}
				/>
			</Form>
			<Form.Item
				label={<span className={styles.colorLabel}>{t('modals.nameChange.colorLabel')}</span>}
				className={styles.colorChange}
			>
				<Select
					style={{ width: 120 }}
					onChange={handleColorChange}
					value={selectedColor.toString()}
					className={styles.colorDropdown}
				>
					{colorOptions.map(e => (
						<Option key={e.toString()} value={e.toString()}>
							<UserColor color={e} aria-label={e.toString()} />
						</Option>
					))}
				</Select>
			</Form.Item>
		</div>
	);
};
