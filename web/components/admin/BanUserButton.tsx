import { Modal, Button, theme } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { USER_ENABLED_TOGGLE, fetchData } from '../../utils/apis';
import { User } from '../../types/chat';

// Lazy loaded components

const ExclamationCircleFilled = dynamic(() => import('@ant-design/icons/ExclamationCircleFilled'), {
	ssr: false,
});

const QuestionCircleFilled = dynamic(() => import('@ant-design/icons/QuestionCircleFilled'), {
	ssr: false,
});

const StopTwoTone = dynamic(() => import('@ant-design/icons/StopTwoTone'), {
	ssr: false,
});

export type BanUserButtonProps = {
	user: User;
	isEnabled: boolean; // = this user's current status
	label?: string;
	onClick?: () => void;
};

export const BanUserButton: FC<BanUserButtonProps> = ({
	user,
	isEnabled,
	label = '',
	onClick = () => {},
}) => {
	const { t } = useTranslation();
	const { token } = theme.useToken();

	async function buttonClicked({ id }): Promise<boolean> {
		const data = {
			userId: id,
			enabled: !isEnabled, // set user to this value
		};
		try {
			const result = await fetchData(USER_ENABLED_TOGGLE, {
				data,
				method: 'POST',
				auth: true,
			});
			return result.success;
		} catch (e) {
			console.error(e);
		}
		return false;
	}

	const actionString = isEnabled
		? t('admin.layout.banUserButton.actionBan')
		: t('admin.layout.banUserButton.actionUnban');
	const icon = isEnabled ? (
		<ExclamationCircleFilled style={{ color: token.colorError }} />
	) : (
		<QuestionCircleFilled style={{ color: token.colorWarning }} />
	);

	const content = (
		<>
			<strong>{user.displayName}</strong>{' '}
			{t('admin.layout.banUserButton.confirmContent', { action: actionString })}
			{isEnabled ? t('admin.layout.banUserButton.deleteMessagesNote') : ''}
		</>
	);

	const confirmBlockAction = () => {
		Modal.confirm({
			title: t('admin.layout.banUserButton.confirmTitle', { action: actionString }),
			content,
			onCancel: () => {},
			onOk: () =>
				new Promise((resolve, reject) => {
					const result = buttonClicked(user);
					if (result) {
						// wait a bit before closing so the user/client tables repopulate
						// GW: TODO: put users/clients data in global app context instead, then call a function here to update that state. (current in another branch)
						setTimeout(() => {
							resolve(result);
							onClick?.();
						}, 3000);
					} else {
						reject();
					}
				}),
			okType: 'danger',
			okText: isEnabled
				? t('admin.layout.banUserButton.okBan')
				: t('admin.layout.banUserButton.okUnban'),
			cancelText: t('admin.layout.common.cancel'),
			icon,
		});
	};

	return (
		<Button
			type="primary"
			onClick={confirmBlockAction}
			size="small"
			icon={isEnabled ? <StopTwoTone twoToneColor="#ff4d4f" /> : null}
			className="block-user-button"
		>
			{label || actionString}
		</Button>
	);
};
