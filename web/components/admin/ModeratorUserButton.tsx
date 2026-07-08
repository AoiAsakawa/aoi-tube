import { Modal, Button, theme } from 'antd';

import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { USER_SET_MODERATOR, fetchData } from '../../utils/apis';
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

const SafetyCertificateTwoTone = dynamic(
	() => import('@ant-design/icons/SafetyCertificateTwoTone'),
	{
		ssr: false,
	},
);

export type ModeratorUserButtonProps = {
	user: User;
	onClick?: () => void;
};

export const ModeratorUserButton: FC<ModeratorUserButtonProps> = ({ user, onClick = null }) => {
	const { t } = useTranslation();
	const { token } = theme.useToken();

	async function buttonClicked({ id }, setAsModerator: Boolean): Promise<Boolean> {
		const data = {
			userId: id,
			isModerator: setAsModerator,
		};
		try {
			const result = await fetchData(USER_SET_MODERATOR, {
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

	const isModerator = user.scopes?.includes('MODERATOR');
	const actionString = isModerator
		? t('admin.layout.moderatorUserButton.actionRevoke')
		: t('admin.layout.moderatorUserButton.actionGrant');
	const icon = isModerator ? (
		<ExclamationCircleFilled style={{ color: token.colorError }} />
	) : (
		<QuestionCircleFilled style={{ color: token.colorWarning }} />
	);

	const content = (
		<>
			<strong>{user.displayName}</strong>{' '}
			{t('admin.layout.moderatorUserButton.confirmContent', { action: actionString })}
		</>
	);

	const confirmBlockAction = () => {
		Modal.confirm({
			title: t('admin.layout.moderatorUserButton.confirmTitle', { action: actionString }),
			content,
			onCancel: () => {},
			onOk: () =>
				new Promise((resolve, reject) => {
					const result = buttonClicked(user, !isModerator);
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
			okText: isModerator
				? t('admin.layout.moderatorUserButton.okRevoke')
				: t('admin.layout.moderatorUserButton.okGrant'),
			cancelText: t('admin.layout.common.cancel'),
			icon,
		});
	};

	return (
		<Button
			type="primary"
			onClick={confirmBlockAction}
			size="small"
			icon={
				isModerator ? (
					<StopTwoTone twoToneColor="#ff4d4f" />
				) : (
					<SafetyCertificateTwoTone twoToneColor="#22bb44" />
				)
			}
			className="block-user-button"
		>
			{actionString}
		</Button>
	);
};
