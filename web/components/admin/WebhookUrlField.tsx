import { Typography } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export type WebhookUrlFieldProps = {
	/** API path of the webhook endpoint, e.g. "/api/stripe/webhook". */
	path: string;
};

/**
 * Read-only, copyable webhook URL for this instance. The origin always comes
 * from the browser, replacing the hand-rolled per-page URL blocks (and their
 * dead instanceDetails conditionals).
 */
export const WebhookUrlField: FC<WebhookUrlFieldProps> = ({ path }) => {
	const { t } = useTranslation();
	const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

	return (
		<div>
			<Text code copyable>
				{url}
			</Text>
			<div style={{ marginTop: 4 }}>
				<Text type="secondary">{t('admin.config.shared.webhookUrlDescription')}</Text>
			</div>
		</div>
	);
};
