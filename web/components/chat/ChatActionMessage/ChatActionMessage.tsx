import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ChatActionMessage.module.scss';

export type ChatActionMessageProps = {
	body: string;
	// Server-sent system actions may carry a translation key so each viewer
	// sees the message in their own language; body is the raw fallback.
	translationKey?: string;
	translationVars?: Record<string, string>;
};

export const ChatActionMessage: FC<ChatActionMessageProps> = ({
	body,
	translationKey,
	translationVars,
}) => {
	const { t, i18n } = useTranslation();

	const fullKey = `chat.system.${translationKey}`;
	if (translationKey && i18n.exists(fullKey)) {
		return <div className={styles.chatAction}>{t(fullKey, translationVars)}</div>;
	}

	return <div dangerouslySetInnerHTML={{ __html: body }} className={styles.chatAction} />;
};
