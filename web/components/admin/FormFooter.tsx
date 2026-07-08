import { Button } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './FormFooter.module.scss';

export type FormFooterProps = {
	onSave: () => void;
	saving: boolean;
	disabled?: boolean;
};

/**
 * Sticky save bar for whole-page admin config forms. The label reuses the
 * shared save key already present in every locale catalog.
 */
export const FormFooter: FC<FormFooterProps> = ({ onSave, saving, disabled }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.footer}>
			<Button type="primary" onClick={onSave} loading={saving} disabled={disabled}>
				{t('admin.config.shared.saveSettings')}
			</Button>
		</div>
	);
};
