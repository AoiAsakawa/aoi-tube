import { ErrorBoundary } from 'react-error-boundary';
import { ChatMessage } from '../../../../interfaces/chat-message.model';
import { ChatContainer } from '../../../../components/chat/ChatContainer/ChatContainer';
import { ClientConfigStore } from '../../../../components/stores/ClientConfigStore';
import {
	useCurrentUser,
	useChatMessages,
	useIsChatAvailable,
} from '../../../../components/stores/zustand-store';
import { Theme } from '../../../../components/theme/Theme';
import { ComponentError } from '../../../../components/ui/ComponentError/ComponentError';

export default function ReadOnlyChatEmbed() {
	const currentUser = useCurrentUser();
	// The store keeps chat messages as ChatMessage | SocketEvent; the previous
	// Recoil compatibility layer performed the same cast internally.
	const messages = useChatMessages() as ChatMessage[];
	const isChatAvailable = useIsChatAvailable();

	return (
		<div>
			<ErrorBoundary
				fallbackRender={({ error }) => (
					<ComponentError componentName="ReadWriteChatEmbed" message={error instanceof Error ? error.message : String(error)} />
				)}
			>
				<ClientConfigStore />
				<Theme />
				{currentUser && (
					<ChatContainer
						messages={messages}
						usernameToHighlight={currentUser.displayName}
						chatUserId={currentUser.id}
						isModerator={false}
						showInput={false}
						height="100vh"
						chatAvailable={isChatAvailable}
					/>
				)}
			</ErrorBoundary>
		</div>
	);
}
