import React, { FC } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import { StatusState } from '../../utils/input-statuses';

export type FormStatusIndicatorProps = {
	status: StatusState;
};

export const FormStatusIndicator: FC<FormStatusIndicatorProps> = ({ status }) => {
	const { t } = useTranslation();
	const { type, icon, message } = status || {};
	// Status messages may be i18n keys (e.g. from config-constants); plain
	// strings fall back to themselves.
	const displayMessage =
		typeof message === 'string' && message ? t(message, { defaultValue: message }) : message;
	const classes = classNames({
		'status-container': true,
		[`status-${type}`]: type,
		empty: !message,
	});
	return (
		<span className={classes}>
			{icon ? <span className="status-icon">{icon}</span> : null}
			{message ? <span className="status-message">{displayMessage}</span> : null}
		</span>
	);
};
export default FormStatusIndicator;
