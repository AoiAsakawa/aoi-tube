import { FC } from 'react';
import { Modal, Button } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import styles from './NsfwWarningModal.module.scss';

interface Props {
	onConfirm: () => void;
	onDecline: () => void;
}

export const NsfwWarningModal: FC<Props> = ({ onConfirm, onDecline }) => {
	const { t } = useTranslation();
	return (
		<Modal
			title={null}
			open
			closable={false}
			footer={null}
			centered
			maskClosable={false}
			className={styles.modal}
		>
			<div className={styles.container}>
				<div className={styles.iconWrapper}>
					<ExclamationCircleOutlined className={styles.icon} />
				</div>
				<h2 className={styles.title}>{t('modals.nsfwWarning.title')}</h2>
				<p className={styles.message}>{t('modals.nsfwWarning.message1')}</p>
				<p className={styles.message}>{t('modals.nsfwWarning.message2')}</p>
				<div className={styles.buttons}>
					<Button type="primary" size="large" onClick={onConfirm} className={styles.confirmButton}>
						{t('modals.nsfwWarning.confirm')}
					</Button>
					<Button size="large" onClick={onDecline} className={styles.declineButton}>
						{t('modals.nsfwWarning.decline')}
					</Button>
				</div>
				<p className={styles.note}>{t('modals.nsfwWarning.note')}</p>
			</div>
		</Modal>
	);
};

export default NsfwWarningModal;
