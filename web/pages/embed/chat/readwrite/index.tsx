import { ErrorBoundary } from 'react-error-boundary';
import { ChatMessage } from '../../../../interfaces/chat-message.model';
import { ChatContainer } from '../../../../components/chat/ChatContainer/ChatContainer';
import { ClientConfigStore } from '../../../../components/stores/ClientConfigStore';
import {
	useCurrentUser,
	useChatMessages,
	useClientConfig,
	useAppState,
	useServerStatus,
	useIsChatAvailable,
} from '../../../../components/stores/zustand-store';
import Header from '../../../../components/ui/Header/Header';
import { Theme } from '../../../../components/theme/Theme';
import { ComponentError } from '../../../../components/ui/ComponentError/ComponentError';

export default function ReadWriteChatEmbed() {
	const currentUser = useCurrentUser();
	// The store keeps chat messages as ChatMessage | SocketEvent; the previous
	// Recoil compatibility layer performed the same cast internally.
	const messages = useChatMessages() as ChatMessage[];
	const clientConfig = useClientConfig();
	const clientStatus = useServerStatus();

	const appState = useAppState();
	const isChatAvailable = useIsChatAvailable();

	const { name, chatDisabled } = clientConfig;
	const { videoAvailable } = appState;
	const { streamTitle, online } = clientStatus;

	const headerText = online ? streamTitle || name : name;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100dvh',
				background: 'var(--theme-color-components-chat-background)',
			}}
		>
			<ErrorBoundary
				fallbackRender={({ error }) => (
					<ComponentError componentName="ReadWriteChatEmbed" message={error instanceof Error ? error.message : String(error)} />
				)}
			>
				<ClientConfigStore />
				<Theme />
				<Header
					name={headerText}
					chatAvailable
					chatDisabled={chatDisabled}
					online={videoAvailable}
				/>
				{currentUser && (
					<div id="chat-container" style={{ flex: 1, minHeight: 0 }}>
						<ChatContainer
							messages={messages}
							usernameToHighlight={currentUser.displayName}
							chatUserId={currentUser.id}
							isModerator={currentUser.isModerator}
							showInput
							height="100%"
							chatAvailable={isChatAvailable}
						/>
					</div>
				)}
			</ErrorBoundary>
		</div>
	);
}
