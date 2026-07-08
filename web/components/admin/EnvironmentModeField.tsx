import { Alert, Switch, Typography } from 'antd';
import { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export type EnvironmentModeFieldProps = {
	/** True while the safe (sandbox/test) mode is active. */
	checked: boolean;
	onChange: (checked: boolean) => void;
	/**
	 * Warning body shown while production mode is active. Defaults to the
	 * shared production-mode warning copy.
	 */
	productionWarning?: ReactNode;
	/** Optional labels rendered inside the switch (sandbox/production etc.). */
	checkedLabel?: ReactNode;
	uncheckedLabel?: ReactNode;
	/** Optional inline note describing the currently selected mode. */
	modeNote?: ReactNode;
};

/**
 * Sandbox/test-mode toggle shared by the payment config pages: the switch
 * plus the warning Alert that appears while production mode is active.
 * Per-page wording is passed via props.
 */
export const EnvironmentModeField: FC<EnvironmentModeFieldProps> = ({
	checked,
	onChange,
	productionWarning,
	checkedLabel,
	uncheckedLabel,
	modeNote,
}) => {
	const { t } = useTranslation();

	return (
		<div>
			<div style={{ marginTop: 8 }}>
				<Switch
					checked={checked}
					onChange={onChange}
					checkedChildren={checkedLabel}
					unCheckedChildren={uncheckedLabel}
				/>
				{modeNote && <Text style={{ marginLeft: 12 }}>{modeNote}</Text>}
			</div>
			{!checked && (
				<Alert
					message={t('admin.config.shared.productionModeActiveTitle')}
					description={productionWarning ?? t('admin.config.shared.productionModeActiveBody')}
					type="warning"
					showIcon
					style={{ marginTop: 8 }}
				/>
			)}
		</div>
	);
};
