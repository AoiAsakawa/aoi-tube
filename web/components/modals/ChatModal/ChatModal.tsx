import { Modal } from 'antd';
import { FC } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import styles from './ChatModal.module.scss';

import { ComponentError } from '../../ui/ComponentError/ComponentError';
import { ChatContainer } from '../../chat/ChatContainer/ChatContainer';
import { ChatMessage } from '../../../interfaces/chat-message.model';
import { CurrentUser } from '../../../interfaces/current-user';
import { UserDropdown } from '../../common/UserDropdown/UserDropdown';

export type ChatModalProps = {
	messages: ChatMessage[];
	currentUser: CurrentUser;
	handleClose: () => void;
};

export const ChatModal: FC<ChatModalProps> = ({ messages, currentUser, handleClose }) => {
	if (!currentUser) {
		return null;
	}
	const { id, displayName, isModerator } = currentUser;

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="ChatModal"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<Modal
				open
				centered
				maskClosable={false}
				footer={null}
				title={<UserDropdown id="chat-modal-user-menu" showToggleChatOption={false} />}
				styles={{
					mask: { zIndex: 700 },
				}}
				classNames={{ body: styles.modalBody }}
				className={styles.root}
				wrapClassName={styles.modalWrapper}
				onCancel={handleClose}
			>
				<ChatContainer
					messages={messages}
					usernameToHighlight={displayName}
					chatUserId={id}
					isModerator={isModerator}
					chatAvailable
					focusInput={false}
				/>
			</Modal>
		</ErrorBoundary>
	);
};
