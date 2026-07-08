import { Button } from 'antd';
import { FC } from 'react';
import cn from 'classnames';
import { ExternalAction } from '../../../interfaces/external-action';
import styles from './ActionButton.module.scss';

export type ActionButtonProps = {
	action: ExternalAction;
	primary?: boolean;
	externalActionSelected: (action: ExternalAction) => void;
};

export const ActionButton: FC<ActionButtonProps> = ({
	action,
	primary = true,
	externalActionSelected,
}) => {
	const { title, description, icon, color } = action;
	const buttonClass = primary ? styles.primary : styles.secondary;

	return (
		<Button
			type={primary ? 'primary' : 'default'}
			className={cn([styles.button, buttonClass, 'action-button'])}
			onClick={() => externalActionSelected(action)}
			style={color ? { background: color } : undefined}
		>
			{icon && <img src={icon} className={styles.icon} alt={description} />}
			{title}
		</Button>
	);
};
